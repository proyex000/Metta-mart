from django.core.management.base import BaseCommand

from commerce.order_policy import cancel_stale_orders


class Command(BaseCommand):
    help = "Batalkan pesanan belum dibayar yang melewati batas waktu kebijakan koperasi."

    def add_arguments(self, parser):
        parser.add_argument("--batch-size", type=int, default=500)

    def handle(self, *args, **options):
        batch_size = options["batch_size"]
        if batch_size < 1 or batch_size > 5000:
            self.stderr.write(self.style.ERROR("--batch-size harus antara 1 dan 5000."))
            return
        cancelled = cancel_stale_orders(batch_size=batch_size)
        self.stdout.write(self.style.SUCCESS(f"Selesai. {cancelled} pesanan dibatalkan otomatis."))
