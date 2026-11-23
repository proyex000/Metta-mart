from django.urls import path
from .views import AdminParentStudentLinkView, AdminUserListCreateView, ParentChildrenView, CsrfView, LoginView, LogoutView, MeView, RegisterView, ChangePasswordView

urlpatterns = [
    path("auth/csrf/", CsrfView.as_view(), name="auth-csrf"),
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("auth/change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    path("auth/register/", RegisterView.as_view(), name="auth-register"),
    path("admin/users/", AdminUserListCreateView.as_view(), name="admin-users"),
    path("parent/children/", ParentChildrenView.as_view(), name="parent-children"),
    path("admin/parent-student-links/", AdminParentStudentLinkView.as_view(), name="admin-parent-student-links"),
]
