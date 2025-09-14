# SafeMate Backend

AWS Lambda-based backend services for SafeMate blockchain document storage platform.

## Overview

The SafeMate backend provides serverless microservices for secure file management, blockchain integration, and user management. All services are optimized for AWS Free Tier compliance and use Hedera blockchain technology for secure document storage.

## Services

### Core Services
- **user-onboarding** - User registration, authentication, and wallet creation
- **token-vault** - Secure token and secret management with KMS encryption
- **hedera-service** - Blockchain operations and Hedera network integration
- **wallet-manager** - Wallet operations and balance management

### Collaboration Services
- **group-manager** - Team collaboration and group management
- **directory-creator** - File organization and directory structure management

### Authentication Services
- **post-confirmation-wallet-creator** - Cognito trigger for automatic wallet creation

## Architecture

### Serverless Design
- **AWS Lambda** - Event-driven compute for all services
- **API Gateway** - RESTful API endpoints with CORS support
- **DynamoDB** - NoSQL database for user data and metadata
- **KMS** - Encryption key management for sensitive data
- **Cognito** - User authentication and authorization

### Blockchain Integration
- **Hedera Testnet** - Live blockchain network for wallet operations
- **Hedera SDK** - Official SDK for blockchain transactions
- **Real Wallet Creation** - Actual Hedera accounts for users
- **Token Management** - MATE token rewards system

## Environment Structure

- **dev** - Development environment with testnet integration
- **preprod** - Pre-production environment for testing
- **production** - Production environment (future)

## Development Setup

```bash
# Install dependencies
npm install

# Build and package services
npm run build

# Deploy to development
npm run deploy:dev
```

## Service Details

### User Onboarding Service
- **Purpose**: User registration and initial setup
- **Features**: 
  - Cognito user creation
  - Hedera wallet generation
  - Profile initialization
  - Email verification (via Cognito directly)

### Token Vault Service
- **Purpose**: Secure storage of user secrets and tokens
- **Features**:
  - KMS-encrypted storage
  - Private key management
  - Token balance tracking
  - Secure key retrieval

### Hedera Service
- **Purpose**: Blockchain operations and transactions
- **Features**:
  - Wallet creation and management
  - Token transfers
  - File storage on Hedera File Service
  - Transaction history

### Group Manager Service
- **Purpose**: Team collaboration features
- **Features**:
  - Group creation and management
  - Member invitations
  - Shared wallet access
  - Activity tracking

### Directory Creator Service
- **Purpose**: File organization and structure
- **Features**:
  - Directory creation
  - File metadata management
  - Folder hierarchy
  - Access permissions

## Free Tier Compliance

All services are optimized for AWS Free Tier:
- **Lambda Functions**: Minimal memory allocation and execution time
- **DynamoDB**: On-demand billing with minimal read/write capacity
- **KMS**: Free tier key usage
- **API Gateway**: Free tier request limits
- **Cognito**: Free tier user pool limits

## Security Features

- **End-to-End Encryption**: All sensitive data encrypted with KMS
- **Private Key Protection**: User private keys never stored in plain text
- **CORS Configuration**: Proper cross-origin request handling
- **Authentication**: Cognito-based user authentication
- **Audit Logging**: Comprehensive activity tracking

## API Endpoints

### User Onboarding API
- `POST /onboarding/register` - User registration
- `POST /onboarding/verify` - Email verification
- `GET /onboarding/status` - Registration status

### Token Vault API
- `POST /vault/store` - Store encrypted data
- `GET /vault/retrieve` - Retrieve encrypted data
- `DELETE /vault/remove` - Remove stored data

### Wallet Manager API
- `GET /wallet/balance` - Get wallet balance
- `POST /wallet/transfer` - Transfer tokens
- `GET /wallet/history` - Transaction history

### Hedera Service API
- `POST /hedera/create-wallet` - Create new wallet
- `POST /hedera/upload-file` - Upload file to blockchain
- `GET /hedera/file-info` - Get file information

## Deployment

Each branch automatically deploys to its corresponding environment:
- **dev branch** → Development Lambda functions and API Gateway
- **preprod branch** → Pre-production Lambda functions and API Gateway
- **main branch** → Production Lambda functions and API Gateway

## Monitoring and Logging

- **CloudWatch Logs**: Comprehensive logging for all services
- **Error Tracking**: Detailed error reporting and debugging
- **Performance Monitoring**: Function execution metrics
- **Audit Trail**: User activity and system events

## Deployment Status

### ✅ **Ready for Deployment**
- **User Onboarding Service**: Complete with email verification and Hedera wallet creation
- **Email Verification Service**: AWS SDK v3 implementation with universal verification
- **Hedera Service**: Real testnet integration with 0.10 HBAR transfers
- **All Services**: AWS SDK v3 compliant, Free Tier optimized

### 🚀 **Deployment Scripts Available**
- `deploy-all-services.ps1` - PowerShell deployment script
- `deploy-services.bat` - Windows batch deployment script
- `configure-environment-variables.ps1` - Environment variables configuration
- `DEPLOYMENT_GUIDE.md` - Comprehensive deployment instructions

### 📦 **Deployment Packages Ready**
- `user-onboarding-clean-final.zip` - User onboarding service
- `hedera-service.zip` - Hedera blockchain service
- `email-verification-service.zip` - Email verification service

## Last Updated

2025-01-15 - Added deployment scripts, AWS SDK v3 migration, and comprehensive deployment documentation