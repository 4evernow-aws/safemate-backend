# SafeMate Preprod API Gateway Duplicate Analysis

**Date:** 2025-09-15  
**Environment:** Preprod  
**Status:** 🔍 **ANALYSIS COMPLETE**

## 📊 **Duplicate API Gateway Resources Identified**

### **Master Resources (Keep - with "Pre-Production" in description):**

| Service | API ID | Name | Description | Created Date |
|---------|--------|------|-------------|--------------|
| **Hedera** | `2kwe2ly8vh` | preprod-safemate-hedera-api | API Gateway for SafeMate Hedera Service (Pre-Production) | 2025-08-27 |
| **Group Management** | `3r08ehzgk1` | preprod-safemate-group-api | API Gateway for SafeMate Group Management (Pre-Production) | 2025-08-27 |
| **Wallet Manager** | `9t9hk461kh` | preprod-safemate-wallet-api | API Gateway for SafeMate Wallet Manager (Pre-Production) | 2025-08-27 |
| **Directory NFT** | `e3k7nfvzab` | preprod-safemate-directory-api | API Gateway for SafeMate Directory NFT Management (Pre-Production) | 2025-08-27 |
| **Token Vault** | `fg85dzr0ag` | preprod-safemate-vault-api | API Gateway for SafeMate Token Vault (Pre-Production) | 2025-08-27 |
| **User Onboarding** | `ol212feqdl` | preprod-safemate-onboarding-api | API Gateway for SafeMate User Onboarding (Pre-Production) | 2025-08-27 |

### **Duplicate Resources (Remove - without "Pre-Production" in description):**

| Service | API ID | Name | Description | Created Date | Status |
|---------|--------|------|-------------|--------------|--------|
| **Hedera** | `1yais7r0mh` | preprod-safemate-hedera-api | API Gateway for SafeMate Hedera Service | 2025-09-06 | ❌ DUPLICATE |
| **Group Management** | `8a6qaslcbc` | preprod-safemate-group-api | API Gateway for SafeMate Group Management (Pre-Production) | 2025-08-27 | ❌ DUPLICATE |
| **Group Management** | `rlyxo9c27f` | preprod-safemate-group-api | API Gateway for SafeMate Group Management | 2025-09-06 | ❌ DUPLICATE |
| **Wallet Manager** | `vjwk1lk6oj` | preprod-safemate-wallet-api | API Gateway for SafeMate Wallet Manager | 2025-09-06 | ❌ DUPLICATE |
| **Directory NFT** | `g4c0mxwy95` | preprod-safemate-directory-api | API Gateway for SafeMate Directory NFT Management | 2025-09-06 | ❌ DUPLICATE |
| **Token Vault** | `062uk9bkqc` | preprod-safemate-vault-api | API Gateway for SafeMate Token Vault | 2025-09-06 | ❌ DUPLICATE |
| **User Onboarding** | `ogxunodkn1` | preprod-safemate-onboarding-api | API Gateway for SafeMate User Onboarding | 2025-09-06 | ❌ DUPLICATE |

## 🎯 **Cleanup Plan**

### **Resources to DELETE (7 duplicates):**
1. `1yais7r0mh` - preprod-safemate-hedera-api (duplicate)
2. `8a6qaslcbc` - preprod-safemate-group-api (duplicate)
3. `rlyxo9c27f` - preprod-safemate-group-api (duplicate)
4. `vjwk1lk6oj` - preprod-safemate-wallet-api (duplicate)
5. `g4c0mxwy95` - preprod-safemate-directory-api (duplicate)
6. `062uk9bkqc` - preprod-safemate-vault-api (duplicate)
7. `ogxunodkn1` - preprod-safemate-onboarding-api (duplicate)

### **Resources to KEEP (6 masters):**
1. `2kwe2ly8vh` - preprod-safemate-hedera-api (master)
2. `3r08ehzgk1` - preprod-safemate-group-api (master)
3. `9t9hk461kh` - preprod-safemate-wallet-api (master)
4. `e3k7nfvzab` - preprod-safemate-directory-api (master)
5. `fg85dzr0ag` - preprod-safemate-vault-api (master)
6. `ol212feqdl` - preprod-safemate-onboarding-api (master)

## ⚠️ **Important Notes**

### **Current Frontend Configuration:**
The frontend `.env.preprod` is currently configured to use some of the duplicate APIs:
- `VITE_ONBOARDING_API_URL=https://ogxunodkn1.execute-api.ap-southeast-2.amazonaws.com/preprod` (DUPLICATE)
- `VITE_VAULT_API_URL=https://062uk9bkqc.execute-api.ap-southeast-2.amazonaws.com/preprod` (DUPLICATE)
- `VITE_WALLET_API_URL=https://vjwk1lk6oj.execute-api.ap-southeast-2.amazonaws.com/preprod` (DUPLICATE)
- `VITE_HEDERA_API_URL=https://1yais7r0mh.execute-api.ap-southeast-2.amazonaws.com/preprod` (DUPLICATE)
- `VITE_GROUP_API_URL=https://rlyxo9c27f.execute-api.ap-southeast-2.amazonaws.com/preprod` (DUPLICATE)

### **Required Updates:**
After cleanup, the frontend configuration needs to be updated to use the master API Gateway IDs.

## 🔍 **Detailed Comparison**

### **Hedera Service:**
- **Master:** `2kwe2ly8vh` (2025-08-27) - "Pre-Production"
- **Duplicate:** `1yais7r0mh` (2025-09-06) - No "Pre-Production"

### **Group Management:**
- **Master:** `3r08ehzgk1` (2025-08-27) - "Pre-Production"
- **Duplicate 1:** `8a6qaslcbc` (2025-08-27) - "Pre-Production" (same day, different time)
- **Duplicate 2:** `rlyxo9c27f` (2025-09-06) - No "Pre-Production"

### **Wallet Manager:**
- **Master:** `9t9hk461kh` (2025-08-27) - "Pre-Production"
- **Duplicate:** `vjwk1lk6oj` (2025-09-06) - No "Pre-Production"

### **Directory NFT Management:**
- **Master:** `e3k7nfvzab` (2025-08-27) - "Pre-Production"
- **Duplicate:** `g4c0mxwy95` (2025-09-06) - No "Pre-Production"

### **Token Vault:**
- **Master:** `fg85dzr0ag` (2025-08-27) - "Pre-Production"
- **Duplicate:** `062uk9bkqc` (2025-09-06) - No "Pre-Production"

### **User Onboarding:**
- **Master:** `ol212feqdl` (2025-08-27) - "Pre-Production"
- **Duplicate:** `ogxunodkn1` (2025-09-06) - No "Pre-Production"

## 📋 **Cleanup Steps**

1. **Update Frontend Configuration** - Point to master API Gateway IDs
2. **Delete Duplicate API Gateways** - Remove 7 duplicate resources
3. **Verify Functionality** - Test all endpoints with master APIs
4. **Update Documentation** - Reflect new API Gateway IDs

## 🚨 **Risk Assessment**

### **Low Risk:**
- All duplicates appear to be created during migration process
- Master APIs are older and more established
- Frontend configuration can be easily updated

### **Mitigation:**
- Test master APIs before deleting duplicates
- Keep backup of current frontend configuration
- Verify all Lambda functions are properly connected to master APIs

---

**Analysis Complete:** 2025-09-15  
**Next Action:** Execute cleanup plan
