const { 
  SecretsManagerClient, 
  GetSecretValueCommand, 
  PutSecretValueCommand 
} = require('@aws-sdk/client-secrets-manager');
const { 
  KMSClient, 
  GenerateDataKeyCommand, 
  DecryptCommand 
} = require('@aws-sdk/client-kms');
const crypto = require('crypto');

class SecureKeyManager {
  constructor() {
    this.region = 'ap-southeast-2';
    this.secretsClient = new SecretsManagerClient({ region: this.region });
    this.kmsClient = new KMSClient({ region: this.region });
    this.kmsKeyId = 'alias/safemate-master-key-dev';
    this.secretName = 'safemate/hedera/private-keys-dev';
  }

  async generateSecureKeypair(userId) {
    try {
      console.log(`🔐 Generating secure keypair for user: ${userId}`);
      
      // Generate Ed25519 keypair using existing Hedera logic
      const { Ed25519PrivateKey } = require('@hashgraph/sdk');
      const { privateKey, publicKey } = Ed25519PrivateKey.generate();
      
      // Create envelope encryption for private key
      const encryptedKey = await this.encryptPrivateKey(privateKey.toString());
      
      // Store in Secrets Manager with user-specific path
      const secretValue = {
        userId: userId,
        encryptedPrivateKey: encryptedKey.encryptedData,
        dataKeyEncrypted: encryptedKey.encryptedDataKey,
        authTag: encryptedKey.authTag,
        publicKey: publicKey.toString(),
        accountAlias: `alias-${publicKey.toStringRaw()}`,
        createdAt: new Date().toISOString(),
        version: '2.0-kms',
        security: 'kms-enhanced'
      };

      await this.storeSecureSecret(userId, secretValue);
      
      console.log(`✅ Secure keypair generated for user: ${userId}`);
      
      return {
        userId,
        accountAlias: secretValue.accountAlias,
        publicKey: secretValue.publicKey,
        encryptionInfo: {
          kmsKeyId: this.kmsKeyId,
          secretName: `${this.secretName}/${userId}`
        }
      };
    } catch (error) {
      console.error('🔴 Secure keypair generation failed:', error);
      throw error;
    }
  }

  async encryptPrivateKey(privateKeyString) {
    try {
      // Generate data key for envelope encryption
      const dataKeyCommand = new GenerateDataKeyCommand({
        KeyId: this.kmsKeyId,
        KeySpec: 'AES_256'
      });
      
      const dataKeyResponse = await this.kmsClient.send(dataKeyCommand);
      
      // Encrypt private key with data key using AES-GCM
      const cipher = crypto.createCipher('aes-256-gcm', dataKeyResponse.Plaintext);
      let encryptedData = cipher.update(privateKeyString, 'utf8', 'base64');
      encryptedData += cipher.final('base64');
      
      return {
        encryptedData,
        encryptedDataKey: Buffer.from(dataKeyResponse.CiphertextBlob).toString('base64'),
        authTag: cipher.getAuthTag().toString('base64')
      };
    } catch (error) {
      console.error('🔴 Private key encryption failed:', error);
      throw error;
    }
  }

  async decryptPrivateKey(encryptedData, encryptedDataKey, authTag) {
    try {
      // Decrypt data key with KMS
      const decryptCommand = new DecryptCommand({
        CiphertextBlob: Buffer.from(encryptedDataKey, 'base64')
      });
      
      const decryptResponse = await this.kmsClient.send(decryptCommand);
      
      // Decrypt private key with data key
      const decipher = crypto.createDecipher('aes-256-gcm', decryptResponse.Plaintext);
      decipher.setAuthTag(Buffer.from(authTag, 'base64'));
      
      let decryptedData = decipher.update(encryptedData, 'base64', 'utf8');
      decryptedData += decipher.final('utf8');
      
      return decryptedData;
    } catch (error) {
      console.error('🔴 Private key decryption failed:', error);
      throw error;
    }
  }

  async storeSecureSecret(userId, secretValue) {
    try {
      const putSecretCommand = new PutSecretValueCommand({
        SecretId: `${this.secretName}/${userId}`,
        SecretString: JSON.stringify(secretValue)
      });
      
      return await this.secretsClient.send(putSecretCommand);
    } catch (error) {
      console.error('🔴 Secret storage failed:', error);
      throw error;
    }
  }

  async retrieveSecureSecret(userId) {
    try {
      const getSecretCommand = new GetSecretValueCommand({
        SecretId: `${this.secretName}/${userId}`,
        VersionStage: 'AWSCURRENT'
      });
      
      const response = await this.secretsClient.send(getSecretCommand);
      return JSON.parse(response.SecretString);
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        return null; // User doesn't have a wallet yet
      }
      console.error('🔴 Secret retrieval failed:', error);
      throw error;
    }
  }
}

module.exports = { SecureKeyManager }; 