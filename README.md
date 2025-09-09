# SafeMate Backend

AWS Lambda-based backend services for SafeMate blockchain document storage platform.

## Services

- user-onboarding - User registration and wallet creation
- token-vault - Token management
- hedera-service - Blockchain operations
- group-manager - Group collaboration
- directory-creator - Directory management
- wallet-manager - Wallet operations
- post-confirmation - Cognito triggers

## Environment Structure

- dev - Development environment
- preprod - Pre-production environment
- main - Production environment

## Development

`ash
npm install
npm run build
`

## Deployment

Each branch automatically deploys to its corresponding environment:
- dev branch → Development Lambda functions
- preprod branch → Pre-production Lambda functions
- main branch → Production Lambda functions
