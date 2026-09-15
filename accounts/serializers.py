from rest_framework import serializers

from .models import User


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password']

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
        )


class CustomerSerializer(serializers.ModelSerializer):
    # Response-only representation for the staff-only customer list
    # (CustomerListAdminView). password/is_staff/is_superuser/
    # last_login/groups/user_permissions are intentionally excluded —
    # this is a read-only customer directory, not an account-management
    # or authentication surface.
    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'is_active',
            'date_joined',
        ]
        read_only_fields = fields
