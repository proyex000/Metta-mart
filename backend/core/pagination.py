from django.core.paginator import EmptyPage, PageNotAnInteger, Paginator
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response


class OptionalPaginationMixin:
    """Keep the legacy array response unless the caller explicitly requests pagination."""
    default_limit = None
    maximum_page_size = 200

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        opted_in = "page" in request.query_params or "page_size" in request.query_params

        if not opted_in:
            if self.default_limit:
                queryset = queryset[: self.default_limit]
            serializer = self.get_serializer(queryset, many=True)
            return Response(serializer.data)

        try:
            page_number = int(request.query_params.get("page", "1"))
            page_size = int(request.query_params.get("page_size", "50"))
        except (TypeError, ValueError):
            raise ValidationError({"pagination": "page dan page_size harus berupa bilangan bulat."})

        if page_number < 1:
            raise ValidationError({"page": "Nomor halaman minimal 1."})
        if page_size < 1 or page_size > self.maximum_page_size:
            raise ValidationError({"page_size": f"Ukuran halaman harus antara 1 dan {self.maximum_page_size}."})

        paginator = Paginator(queryset, page_size)
        try:
            page = paginator.page(page_number)
        except EmptyPage:
            raise ValidationError({"page": "Halaman yang diminta tidak tersedia."})
        except PageNotAnInteger:
            raise ValidationError({"page": "Nomor halaman tidak valid."})

        serializer = self.get_serializer(page.object_list, many=True)
        return Response({
            "count": paginator.count,
            "page": page.number,
            "page_size": page_size,
            "total_pages": paginator.num_pages,
            "results": serializer.data,
        })
