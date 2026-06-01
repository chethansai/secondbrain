from django.http import JsonResponse
from django.views.decorators.http import require_GET

from .firebase_client import FirebaseNotesError, NOTETAKING_FEATURES_CATEGORY, get_notetaking_features_items


@require_GET
def get_notetaking_features(request):
	try:
		found, items = get_notetaking_features_items()
	except FirebaseNotesError as error:
		return JsonResponse({'error': str(error)}, status=500)
	except Exception:
		return JsonResponse({'error': 'Unable to read notetaking features from Firebase.'}, status=500)

	return JsonResponse({
		'category': NOTETAKING_FEATURES_CATEGORY,
		'found': found,
		'items': items,
	})