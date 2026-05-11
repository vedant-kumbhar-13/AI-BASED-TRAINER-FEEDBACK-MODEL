import re
from rest_framework import serializers
from django.contrib.auth import authenticate
from .models import CustomUser

class RegisterSerializer(serializers.ModelSerializer):
    """User registration serializer"""
    password = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'}
    )
    password_confirm = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'}
    )

    class Meta:
        model = CustomUser
        fields = ('username', 'email', 'first_name', 'last_name', 'password', 'password_confirm')

    def validate(self, data):
        name_fields = ['first_name', 'last_name']
        for field in name_fields:
            value = data.get(field, '').strip()
            if value and not re.match(r"^[a-zA-Z\s'\-]{1,50}$", value):
                raise serializers.ValidationError({
                    field: f'{field.replace("_", " ").title()} must contain only letters.'
                })

        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError({
                "password": "Passwords do not match"
            })

        # M9 fix: enforce minimum password complexity
        if len(data['password']) < 8:
            raise serializers.ValidationError({
                "password": "Password must be at least 8 characters long."
            })
        if CustomUser.objects.filter(email=data['email']).exists():
            raise serializers.ValidationError({
                "email": "Email already registered"
            })
        
        if CustomUser.objects.filter(username=data['username']).exists():
            raise serializers.ValidationError({
                "username": "Username already taken"
            })
        
        return data

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        password = validated_data.pop('password')
        
        user = CustomUser.objects.create_user(
            **validated_data,
            password=password
        )
        return user


class LoginSerializer(serializers.Serializer):
    """User login serializer"""
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={'input_type': 'password'})

    def validate(self, data):
        email = data.get('email')
        password = data.get('password')

        try:
            user = CustomUser.objects.get(email=email)
        except CustomUser.DoesNotExist:
            raise serializers.ValidationError("Invalid email or password")

        if not user.check_password(password):
            raise serializers.ValidationError("Invalid email or password")

        if not user.is_active:
            raise serializers.ValidationError("User account is inactive")

        data['user'] = user
        return data


class UserSerializer(serializers.ModelSerializer):
    """User profile serializer"""
    class Meta:
        model = CustomUser
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'profile_picture')
        read_only_fields = ('id',)
