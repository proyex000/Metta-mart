from django.core.management.base import BaseCommand
from commerce.views import expire_due_qris_orders


class Command(BaseCommand):
    help = "Expire unpaid static-QRIS orders and release their reserved stock. Run periodically from a scheduler."

    def handle(self, *args, **options):
        count = expire_due_qris_orders()
        self.stdout.write(self.style.SUCCESS(f"Expired {count} QRIS order(s)."))
