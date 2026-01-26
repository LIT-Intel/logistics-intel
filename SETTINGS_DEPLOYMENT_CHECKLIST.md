# Settings System Deployment Checklist

## Pre-Deployment Verification

### Database ✅
- [x] Security audit logs table created
- [x] User profiles table created
- [x] Integrations table created
- [x] Feature toggles table created
- [x] All RLS policies applied
- [x] Indexes created for performance
- [x] Foreign key constraints verified

**Migration Status**: Applied on 2026-01-26

### Backend ✅
- [x] Settings routes implemented (20+ endpoints)
- [x] JWT authentication verified
- [x] Role-based access control implemented
- [x] Input validation via Zod schemas
- [x] Error handling comprehensive
- [x] Rate limiting enabled (100/15min)
- [x] All endpoints tested manually

**Build Status**: ✅ No errors

### Frontend ✅
- [x] Settings API client library created
- [x] SettingsPage component integrated with real API
- [x] Toast notification system implemented
- [x] Form validation added
- [x] Loading states added
- [x] Error boundaries implemented
- [x] Team invitation UI functional
- [x] All tabs wired to API

**Build Status**: ✅ No errors (26.07 KB gzip)

---

## Deployment Steps

### 1. Database Migration
```bash
# Verify migration applied
supabase migrations list | grep 20260126_create_additional_settings_tables

# Expected output:
# [x] 20260126_create_additional_settings_tables

# If not applied:
supabase db push
```

### 2. Backend Deployment
```bash
# Build backend
cd services/crm-api
npm install
npm run build

# Verify settings routes
npm run start
# Should see: Settings router loaded
# All 20+ endpoints available at /settings/*

# Test health check
curl http://localhost:3000/health
# Response should include settings routes
```

### 3. Frontend Deployment
```bash
# Build frontend
cd frontend
npm install
npm run build

# Verify build output
ls -la dist/
# Should include: SettingsPage-*.js

# Deploy to Vercel/hosting
# Update environment variables:
VITE_SUPABASE_URL=<your_supabase_url>
VITE_SUPABASE_ANON_KEY=<your_supabase_key>
```

### 4. Environment Configuration
Verify these are set in production:
```bash
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
SUPABASE_ANON_KEY=xxx

# Backend
API_KEY=<optional_api_key>
NODE_ENV=production

# Frontend
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
VITE_API_BASE=/api/lit
```

---

## Verification Tests

### Organization Management
```bash
# 1. Get organization
curl -X GET https://app.example.com/api/lit/settings/organization \
  -H "Authorization: Bearer $JWT"
# Expected: 200 OK with org data

# 2. Update organization
curl -X PUT https://app.example.com/api/lit/settings/organization \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated Name"}'
# Expected: 200 OK with updated org

# 3. Verify persistence
# Refresh page and verify name persists
```

### Team Management
```bash
# 1. List team members
curl -X GET https://app.example.com/api/lit/settings/team/members \
  -H "Authorization: Bearer $JWT"
# Expected: 200 OK with members array

# 2. Invite user
curl -X POST https://app.example.com/api/lit/settings/team/invite \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","role":"member"}'
# Expected: 201 Created with invite object

# 3. List invites
curl -X GET https://app.example.com/api/lit/settings/team/invites \
  -H "Authorization: Bearer $JWT"
# Expected: 200 OK with pending invites

# 4. Remove member (if applicable)
curl -X DELETE https://app.example.com/api/lit/settings/team/members/MEMBER_ID \
  -H "Authorization: Bearer $JWT"
# Expected: 200 OK with success: true
```

### Billing & Usage
```bash
# 1. Get billing info
curl -X GET https://app.example.com/api/lit/settings/billing \
  -H "Authorization: Bearer $JWT"
# Expected: 200 OK with billing, seats, tokens data

# 2. Get usage by feature
curl -X GET https://app.example.com/api/lit/settings/usage/by-feature \
  -H "Authorization: Bearer $JWT"
# Expected: 200 OK with feature breakdown

# 3. Get features
curl -X GET https://app.example.com/api/lit/settings/features \
  -H "Authorization: Bearer $JWT"
# Expected: 200 OK with feature toggles
```

### Security & Audit
```bash
# 1. Get audit logs (admin only)
curl -X GET "https://app.example.com/api/lit/settings/audit-logs?limit=10" \
  -H "Authorization: Bearer $JWT_ADMIN"
# Expected: 200 OK with logs array

# 2. Try as non-admin (should fail)
curl -X GET "https://app.example.com/api/lit/settings/audit-logs?limit=10" \
  -H "Authorization: Bearer $JWT_MEMBER"
# Expected: 403 Forbidden
```

### Integrations
```bash
# 1. List integrations
curl -X GET https://app.example.com/api/lit/settings/integrations \
  -H "Authorization: Bearer $JWT"
# Expected: 200 OK with integrations array

# 2. Disconnect integration (requires admin)
curl -X DELETE https://app.example.com/api/lit/settings/integrations/INTEG_ID \
  -H "Authorization: Bearer $JWT_ADMIN"
# Expected: 200 OK with success: true
```

---

## Frontend Testing

### Settings Page Load
- [ ] Navigate to /settings
- [ ] All tabs visible (Account, Users, Billing, Usage, Features, Profile, Integrations, Security)
- [ ] Organization data loads in Account tab
- [ ] Team members list loads
- [ ] Billing info displays
- [ ] Token usage bar shows percentage

### Organization Update
- [ ] Edit organization name
- [ ] Click "Save Changes"
- [ ] Loading state shows
- [ ] Toast notification appears: "Organization updated successfully"
- [ ] Refresh page - name persists

### Team Management
- [ ] Click "Invite User"
- [ ] Form expands showing email + role fields
- [ ] Enter valid email
- [ ] Select role (member/admin)
- [ ] Click "Send Invitation"
- [ ] Toast shows: "Invitation sent successfully"
- [ ] Refresh - new invite appears in list

### Team Member Removal
- [ ] Hover over team member
- [ ] Delete icon appears
- [ ] Click delete
- [ ] Confirmation dialog shown
- [ ] Click confirm
- [ ] Loading state shows
- [ ] Member removed from list
- [ ] Toast shows: "Team member removed"

### Error Handling
- [ ] Try invite without email - error toast
- [ ] Try invite with invalid email - error toast
- [ ] Try invite duplicate - error toast
- [ ] Network error simulation - error toast with retry

### Permissions
- [ ] Regular member - can view settings only
- [ ] Regular member - invite button disabled
- [ ] Regular member - cannot access delete
- [ ] Admin - full access to all functions

---

## Rollback Procedure

If deployment fails:

### 1. Database Rollback
```bash
# Revert migration
supabase db reset --dry-run
# Review changes, then:
supabase db reset

# Or specific rollback (if supported)
supabase migrations delete 20260126_create_additional_settings_tables
```

### 2. Backend Rollback
```bash
# Revert to previous version
git revert <commit_hash>
git push
# Restart backend service
systemctl restart crm-api
```

### 3. Frontend Rollback
```bash
# Revert to previous build
git revert <commit_hash>
# Rebuild and deploy
npm run build
# Deploy to hosting
```

---

## Monitoring Post-Deployment

### Key Metrics to Track
- API endpoint response times
- Error rates by endpoint
- Token usage accuracy
- Database query performance
- RLS policy enforcement

### Logs to Monitor
```bash
# Backend logs
tail -f /var/log/crm-api/error.log
tail -f /var/log/crm-api/access.log

# Database logs
SELECT * FROM security_audit_logs ORDER BY created_at DESC LIMIT 10;

# Rate limiting hits
SELECT COUNT(*) FROM lit_rate_limits WHERE created_at > NOW() - INTERVAL '1 hour';
```

### Health Checks
```bash
# API health
curl https://app.example.com/api/health
# Response: { "status": "ok" }

# Settings endpoint
curl https://app.example.com/api/lit/settings/organization \
  -H "Authorization: Bearer $TEST_JWT"
# Response: { "org": {...}, "settings": {...} }

# Database connection
SELECT COUNT(*) FROM organizations;
```

---

## Post-Deployment Tasks

### 1. Documentation
- [x] API reference complete
- [x] Implementation guide complete
- [x] Deployment checklist created
- [ ] Internal team briefing scheduled

### 2. User Communication
- [ ] Notify admins of new Settings page
- [ ] Share team invitation process
- [ ] Document feature toggles available
- [ ] Provide billing portal link

### 3. Monitoring Setup
- [ ] Enable error tracking (Sentry/similar)
- [ ] Setup performance monitoring
- [ ] Create dashboard for key metrics
- [ ] Setup alerts for failures

### 4. Support Preparation
- [ ] Update help documentation
- [ ] Create FAQ for Settings
- [ ] Setup support escalation process
- [ ] Train support team

---

## Success Criteria

✅ All API endpoints return correct data
✅ Frontend loads without errors
✅ Organization changes persist
✅ Team invitations work end-to-end
✅ Billing information displays accurately
✅ Token usage tracks correctly
✅ Error messages show for invalid actions
✅ Permissions enforced correctly
✅ Performance acceptable (< 200ms responses)
✅ No security vulnerabilities
✅ RLS policies enforce access control
✅ Audit logs record all changes

---

## Timeline

- **Database**: ~5 minutes (migration)
- **Backend**: ~10 minutes (build + deploy)
- **Frontend**: ~15 minutes (build + deploy)
- **Testing**: ~30 minutes (full verification)
- **Rollout**: Staged deployment recommended
  - 10% traffic first (1 day)
  - 50% traffic second (1 day)
  - 100% traffic final (go live)

---

## Contact & Support

**Issues During Deployment?**
- Check environment variables first
- Review backend logs for errors
- Verify Supabase connection
- Check RLS policies enabled
- Test with cURL before frontend

**Technical Questions?**
- Review API reference document
- Check implementation guide
- Verify database schema
- Test endpoints manually

---

## Sign-Off

- [ ] Database verified
- [ ] Backend tested
- [ ] Frontend tested
- [ ] Security checks passed
- [ ] Monitoring configured
- [ ] Team trained
- [ ] Ready for production

**Deployment Date**: _______________
**Deployed By**: _______________
**Verified By**: _______________
