import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import urlopen

import firebase_admin
from django.conf import settings
from firebase_admin import credentials, firestore

NOTES_COLLECTION = 'reactnativecollection'
NOTES_DOCUMENT = 'main'
NOTETAKING_FEATURES_CATEGORY = 'NOTETAKING FEATURES'


class FirebaseNotesError(RuntimeError):
    pass


def _initialize_firebase_app() -> None:
    try:
        firebase_admin.get_app()
        return
    except ValueError:
        pass

    service_account_path = getattr(settings, 'FIREBASE_SERVICE_ACCOUNT_PATH', '')
    if service_account_path:
        credential_path = Path(service_account_path).expanduser()
        if not credential_path.exists():
            raise FirebaseNotesError(f'Firebase service account file not found: {credential_path}')
        firebase_admin.initialize_app(credentials.Certificate(str(credential_path)))
        return

    firebase_admin.initialize_app(credentials.ApplicationDefault())


def _read_local_android_config() -> dict:
    config_path = Path(settings.BASE_DIR).parents[1] / 'android' / 'local.properties'
    if not config_path.exists():
        return {}

    config = {}
    for line in config_path.read_text(encoding='utf-8').splitlines():
        clean_line = line.strip()
        if not clean_line or clean_line.startswith('#') or '=' not in clean_line:
            continue
        key, value = clean_line.split('=', 1)
        config[key.strip()] = value.strip()
    return config


def _get_rest_firebase_config():
    local_config = _read_local_android_config()
    project_id = (
        getattr(settings, 'FIREBASE_PROJECT_ID', '')
        or local_config.get('FIREBASE_PROJECT_ID', '')
        or local_config.get('EXPO_PUBLIC_FIREBASE_PROJECT_ID', '')
    )
    api_key = (
        getattr(settings, 'FIREBASE_API_KEY', '')
        or local_config.get('FIREBASE_API_KEY', '')
        or local_config.get('EXPO_PUBLIC_FIREBASE_API_KEY', '')
    )
    return project_id, api_key


def _decode_firestore_value(value):
    if 'stringValue' in value:
        return value['stringValue']
    if 'arrayValue' in value:
        return [_decode_firestore_value(item) for item in value.get('arrayValue', {}).get('values', [])]
    if 'mapValue' in value:
        fields = value.get('mapValue', {}).get('fields', {})
        return {key: _decode_firestore_value(item) for key, item in fields.items()}
    if 'nullValue' in value:
        return None
    if 'booleanValue' in value:
        return value['booleanValue']
    if 'integerValue' in value:
        return int(value['integerValue'])
    if 'doubleValue' in value:
        return float(value['doubleValue'])
    return None


def _read_notes_document_from_rest():
    project_id, api_key = _get_rest_firebase_config()
    if not project_id:
        raise FirebaseNotesError(
            'Firebase credentials are not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_PROJECT_ID.'
        )

    document_path = '/'.join(quote(part, safe='') for part in [NOTES_COLLECTION, NOTES_DOCUMENT])
    query = f'?{urlencode({"key": api_key})}' if api_key else ''
    url = f'https://firestore.googleapis.com/v1/projects/{quote(project_id, safe="")}/databases/(default)/documents/{document_path}{query}'

    try:
        with urlopen(url, timeout=15) as response:
            raw_document = json.loads(response.read().decode('utf-8'))
    except HTTPError as error:
        if error.code == 404:
            return None
        raise FirebaseNotesError(f'Firestore REST read failed with HTTP {error.code}.') from error
    except (TimeoutError, URLError, json.JSONDecodeError) as error:
        raise FirebaseNotesError('Firestore REST read failed.') from error

    fields = raw_document.get('fields', {})
    return {key: _decode_firestore_value(value) for key, value in fields.items()}


def get_notetaking_features_items():
    service_account_path = getattr(settings, 'FIREBASE_SERVICE_ACCOUNT_PATH', '')
    if service_account_path:
        _initialize_firebase_app()
        client = firestore.client()
        snapshot = client.collection(NOTES_COLLECTION).document(NOTES_DOCUMENT).get()

        if not snapshot.exists:
            return False, []

        document = snapshot.to_dict() or {}
    else:
        document = _read_notes_document_from_rest()

    if document is None:
        return False, []

    data = document.get('data', {})
    if not isinstance(data, dict):
        raise FirebaseNotesError('Firestore notes document has malformed data field.')

    items = data.get(NOTETAKING_FEATURES_CATEGORY)
    if items is None:
        return False, []
    if not isinstance(items, list):
        raise FirebaseNotesError('NOTETAKING FEATURES category is malformed.')

    return True, items