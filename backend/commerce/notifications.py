from accounts.models import User
from .models import Notification


def notify_user(user, kind, title, body, target_url=""):
    if user is None:
        return None
    return Notification.objects.create(recipient=user, kind=kind, title=title[:140], body=body[:500], target_url=target_url[:300])


def notify_admins(kind, title, body, target_url="/admin/orders"):
    admin_ids = User.objects.filter(role=User.Role.ADMIN, is_active=True).values_list("pk", flat=True)
    return Notification.objects.bulk_create([
        Notification(recipient_id=user_id, kind=kind, title=title[:140], body=body[:500], target_url=target_url[:300])
        for user_id in admin_ids
    ])
