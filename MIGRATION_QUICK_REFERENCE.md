# SafeMate Migration Quick Reference Card

**🚨 CRITICAL ISSUES TO AVOID NEXT TIME**

## 1. **Hedera SDK Module Resolution** ⚠️
**Problem:** `Runtime.ImportModuleError: Error: Cannot find module '@hashgraph/sdk'`
**Solution:** 
- Test Hedera SDK in Lambda environment FIRST
- Use CommonJS `require()` instead of ES6 `import`
- Remove `"type": "module"` from package.json
- Create Lambda layers for shared dependencies

## 2. **AWS CLI Environment Variables** ⚠️
**Problem:** `Invalid JSON format` errors
**Solution:**
- Use file-based updates: `file://env-vars.json`
- Proper JSON structure with "Variables" wrapper
- Validate JSON syntax before deployment

## 3. **Lambda Package Size Limits** ⚠️
**Problem:** `RequestEntityTooLargeException` (70MB+ packages)
**Solution:**
- Create Lambda layers for shared dependencies
- Monitor package sizes during development
- Use S3 for large package uploads

## 4. **Missing Service Files** ⚠️
**Problem:** Required files not included in deployment packages
**Solution:**
- Create comprehensive file inventory
- Use automated deployment scripts with validation
- Verify file structure before deployment

---

## 📋 **PRE-MIGRATION CHECKLIST**

### **Before Starting:**
- [ ] Review `MIGRATION_NOTES_DEV_TO_PREPROD.md`
- [ ] Test Hedera SDK in isolated Lambda environment
- [ ] Validate all service dependencies
- [ ] Check package sizes and plan Lambda layers
- [ ] Prepare environment variable templates
- [ ] Create rollback procedures

### **During Migration:**
- [ ] Deploy infrastructure first (Terraform)
- [ ] Deploy shared dependencies (Lambda layers)
- [ ] Deploy core services (Hedera, Token Vault)
- [ ] Deploy user services (Onboarding, Email)
- [ ] Configure API Gateway
- [ ] Update frontend configuration
- [ ] Test each service immediately after deployment

### **After Migration:**
- [ ] Run comprehensive end-to-end tests
- [ ] Monitor performance and error rates
- [ ] Validate all API endpoints
- [ ] Check environment variables
- [ ] Update documentation
- [ ] Review costs and optimize

---

## 🚀 **DEPLOYMENT ORDER**

1. **Infrastructure** (Terraform) - Create base resources
2. **Shared Dependencies** (Lambda Layers) - Deploy common libraries
3. **Core Services** (Hedera, Token Vault) - Deploy main functionality
4. **User Services** (Onboarding, Email) - Deploy user-facing services
5. **API Gateway** - Configure routing and endpoints
6. **Frontend** - Update configuration and test connectivity

---

## 🔧 **TESTING STRATEGY**

### **Before Migration:**
- Unit tests for each service
- Integration tests for service interactions
- Lambda environment compatibility tests
- Package size and dependency validation

### **During Migration:**
- Service health checks after each deployment
- API Gateway endpoint testing
- Environment variable validation
- CORS configuration testing

### **After Migration:**
- End-to-end workflow testing
- Performance benchmarking
- Error handling validation
- Security configuration review

---

## 📊 **SUCCESS METRICS**

### **Technical:**
- [ ] All services deployed successfully
- [ ] API endpoints responding correctly
- [ ] Environment variables properly configured
- [ ] No critical errors in logs

### **Business:**
- [ ] User workflows functioning correctly
- [ ] Email verification working
- [ ] Token storage operational
- [ ] Blockchain integration functional

### **Operational:**
- [ ] Deployment time within acceptable limits
- [ ] Cost impact within budget
- [ ] Performance metrics meeting requirements
- [ ] Security configurations validated

---

## 🎯 **KEY COMMANDS**

### **Environment Variables:**
```bash
aws lambda update-function-configuration \
  --function-name preprod-safemate-hedera-service \
  --environment Variables='{"HEDERA_NETWORK":"testnet","STAGE":"preprod"}'
```

### **File-based Environment Variables:**
```bash
aws lambda update-function-configuration \
  --function-name preprod-safemate-hedera-service \
  --environment file://env-vars.json
```

### **Lambda Layer Creation:**
```bash
aws lambda publish-layer-version \
  --layer-name preprod-safemate-hedera-dependencies \
  --zip-file fileb://hedera-dependencies.zip
```

### **Service Testing:**
```bash
curl -X GET "https://ogxunodkn1.execute-api.ap-southeast-2.amazonaws.com/preprod/test"
```

---

## 📚 **DOCUMENTATION REFERENCES**

- **`MIGRATION_NOTES_DEV_TO_PREPROD.md`** - Detailed lessons learned
- **`PREPROD_STATUS_REPORT.md`** - Current deployment status
- **`DEPLOYMENT_GUIDE.md`** - Service deployment procedures
- **`migrate-dev-to-preprod.ps1`** - Enhanced migration script

---

## 🚨 **EMERGENCY ROLLBACK**

If migration fails:
1. Stop all deployment processes
2. Restore previous environment configuration
3. Verify dev environment is still functional
4. Review error logs and identify root cause
5. Fix issues before retrying migration
6. Update migration procedures based on lessons learned

---

**Last Updated:** 2025-09-15  
**Status:** ✅ **READY FOR NEXT MIGRATION**
