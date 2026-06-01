from pathlib import Path

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


def get_notetaking_features_items():
    _initialize_firebase_app()
    client = firestore.client()
    snapshot = client.collection(NOTES_COLLECTION).document(NOTES_DOCUMENT).get()

    if not snapshot.exists:
        return False, []

    document = snapshot.to_dict() or {}
    data = document.get('data', {})
    if not isinstance(data, dict):
        raise FirebaseNotesError('Firestore notes document has malformed data field.')

    items = data.get(NOTETAKING_FEATURES_CATEGORY)
    if items is None:
        return False, []
    if not isinstance(items, list):
        raise FirebaseNotesError('NOTETAKING FEATURES category is malformed.')

    return True, items