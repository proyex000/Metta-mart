from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from .models import User

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "identifier", "full_name", "email", "role", "is_active", "date_joined")
        read_only_fields = ("id", "role", "is_active", "date_joined")

class RegistrationSerializer(serializers.Serializer):
    identifier = serializers.CharField(max_length=100)
    full_name = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, trim_whitespace=False, min_length=10)
    role = serializers.ChoiceField(choices=(("student", "Siswa"), ("parent", "Orang tua")))

    def validate_identifier(self, value):
        value = value.strip()
        role = self.initial_data.get("role")
        if role == "parent":
            from django.core.validators import validate_email
            try:
                validate_email(value)
            except DjangoValidationError:
                raise serializers.ValidationError("Orang tua harus menggunakan alamat email yang valid.")
        elif role == "student" and not (value.isdigit() and len(value) == 10):
            raise serializers.ValidationError("NISN harus terdiri dari 10 digit angka.")
        if User.objects.filter(identifier__iexact=value).exists():
            raise serializers.ValidationError("Identitas tersebut sudah terdaftar.")
        return value

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def create(self, validated_data):
        role = validated_data.pop("role")
        identifier = validated_data["identifier"]
        email = identifier if role == "parent" else ""
        return User.objects.create_user(**validated_data, email=email, role=role)

class AdminCreateUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=10, trim_whitespace=False)

    class Meta:
        model = User
        fields = ("id", "identifier", "full_name", "email", "role", "password", "is_active")
        read_only_fields = ("id",)

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        return User.objects.create_user(password=password, **validated_data)

class ProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("full_name", "email")

    def validate_full_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Nama lengkap wajib diisi.")
        return value.strip()

    def validate(self, attrs):
        if self.instance.role == User.Role.PARENT and "email" in attrs:
            email = attrs["email"].strip().lower()
            if not email:
                raise serializers.ValidationError({"email": "Email akun orang tua wajib diisi."})
            if User.objects.exclude(pk=self.instance.pk).filter(identifier__iexact=email).exists():
                raise serializers.ValidationError({"email": "Email tersebut sudah digunakan."})
            attrs["email"] = email
            attrs["identifier"] = email
        return attrs
