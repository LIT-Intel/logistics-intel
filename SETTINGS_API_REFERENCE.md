# Settings API Reference

## Base URL
```
/api/lit/settings
```

## Authentication
All requests require:
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

---

## Organization Endpoints

### GET /organization
Fetch organization details and settings.

**Request**
```bash
GET /api/lit/settings/organization
Authorization: Bearer <token>
```

**Response (200 OK)**
```json
{
  "org": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "owner_id": "440e8400-e29b-41d4-a716-446655440000",
    "name": "Acme Logistics",
    "industry": "Logistics, Supply Chain",
    "region": "North America (USA)",
    "timezone": "UTC",
    "logo_url": null,
    "created_at": "2026-01-26T12:00:00Z",
    "updated_at": "2026-01-26T12:00:00Z"
  },
  "settings": {
    "org_id": "550e8400-e29b-41d4-a716-446655440000",
    "search_depth": "full",
    "max_results": 1000,
    "auto_enrichment": false,
    "cache_enabled": true,
    "credit_protection": false,
    "mfa_required": false,
    "magic_link_enabled": false,
    "google_oauth_enabled": false,
    "command_center_defaults": {},
    "rfp_defaults": {}
  },
  "role": "owner"
}
```

**Errors**
- 401: Not authenticated
- 404: No organization (user not in any org)

---

### PUT /organization
Update organization details.

**Request**
```bash
PUT /api/lit/settings/organization
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Company Name",
  "industry": "New Industry",
  "region": "Europe",
  "timezone": "Europe/London"
}
```

**Response (200 OK)**
```json
{
  "org": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Updated Company Name",
    "industry": "New Industry",
    "region": "Europe",
    "timezone": "Europe/London",
    ...
  }
}
```

**Errors**
- 401: Not authenticated
- 403: Insufficient permissions (must be owner/admin)
- 400: Invalid input

---

### GET /org-settings
Fetch organization settings.

**Request**
```bash
GET /api/lit/settings/org-settings
Authorization: Bearer <token>
```

**Response (200 OK)**
```json
{
  "settings": {
    "search_depth": "full",
    "max_results": 1000,
    "auto_enrichment": false,
    "cache_enabled": true,
    "credit_protection": false,
    "mfa_required": false,
    "magic_link_enabled": false,
    "google_oauth_enabled": false
  }
}
```

---

### PUT /org-settings
Update organization settings.

**Request**
```bash
PUT /api/lit/settings/org-settings
Authorization: Bearer <token>
Content-Type: application/json

{
  "search_depth": "full",
  "auto_enrichment": true,
  "mfa_required": true
}
```

**Response (200 OK)**
```json
{
  "settings": { ... updated settings ... }
}
```

**Errors**
- 403: Must be owner/admin
- 400: Invalid setting value

---

## Profile Endpoints

### GET /profile
Fetch current user profile.

**Request**
```bash
GET /api/lit/settings/profile
Authorization: Bearer <token>
```

**Response (200 OK)**
```json
{
  "profile": {
    "id": "440e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "full_name": "John Doe",
    "title": "Sales Manager",
    "phone": "+1-555-000-0000",
    "role": "admin",
    "plan": "pro"
  }
}
```

---

### PUT /profile
Update user profile.

**Request**
```bash
PUT /api/lit/settings/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "full_name": "Jane Doe",
  "title": "Sales Director",
  "phone": "+1-555-111-1111"
}
```

**Response (200 OK)**
```json
{
  "profile": {
    "id": "440e8400-e29b-41d4-a716-446655440000",
    "full_name": "Jane Doe",
    "title": "Sales Director",
    "phone": "+1-555-111-1111",
    ...
  }
}
```

---

## Team Management Endpoints

### GET /team/members
List all team members in organization.

**Request**
```bash
GET /api/lit/settings/team/members
Authorization: Bearer <token>
```

**Response (200 OK)**
```json
{
  "members": [
    {
      "id": "member-001",
      "user_id": "440e8400-e29b-41d4-a716-446655440000",
      "role": "owner",
      "joined_at": "2026-01-20T10:00:00Z",
      "user": {
        "id": "440e8400-e29b-41d4-a716-446655440000",
        "email": "owner@example.com",
        "full_name": "John Doe"
      }
    },
    {
      "id": "member-002",
      "user_id": "550e8400-e29b-41d4-a716-446655440001",
      "role": "admin",
      "joined_at": "2026-01-21T10:00:00Z",
      "user": {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "email": "admin@example.com",
        "full_name": "Jane Smith"
      }
    }
  ]
}
```

---

### POST /team/invite
Send user invitation.

**Request**
```bash
POST /api/lit/settings/team/invite
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "newuser@example.com",
  "role": "member"
}
```

**Response (201 Created)**
```json
{
  "invite": {
    "id": "invite-001",
    "org_id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "newuser@example.com",
    "role": "member",
    "invited_by": "440e8400-e29b-41d4-a716-446655440000",
    "status": "pending",
    "created_at": "2026-01-26T12:00:00Z",
    "expires_at": "2026-02-02T12:00:00Z"
  }
}
```

**Errors**
- 403: Must be owner/admin
- 409: User already invited or member
- 400: Invalid email

---

### PUT /team/members/:member_id/role
Update team member role.

**Request**
```bash
PUT /api/lit/settings/team/members/member-002/role
Authorization: Bearer <token>
Content-Type: application/json

{
  "role": "admin"
}
```

**Response (200 OK)**
```json
{
  "member": {
    "id": "member-002",
    "user_id": "550e8400-e29b-41d4-a716-446655440001",
    "role": "admin",
    "joined_at": "2026-01-21T10:00:00Z"
  }
}
```

---

### DELETE /team/members/:member_id
Remove team member.

**Request**
```bash
DELETE /api/lit/settings/team/members/member-002
Authorization: Bearer <token>
```

**Response (200 OK)**
```json
{
  "success": true
}
```

**Errors**
- 403: Must be owner/admin
- 404: Member not found

---

### GET /team/invites
List pending invitations.

**Request**
```bash
GET /api/lit/settings/team/invites
Authorization: Bearer <token>
```

**Response (200 OK)**
```json
{
  "invites": [
    {
      "id": "invite-001",
      "email": "pending@example.com",
      "role": "member",
      "status": "pending",
      "created_at": "2026-01-26T12:00:00Z",
      "expires_at": "2026-02-02T12:00:00Z"
    }
  ]
}
```

---

## Billing Endpoints

### GET /billing
Fetch billing information.

**Request**
```bash
GET /api/lit/settings/billing
Authorization: Bearer <token>
```

**Response (200 OK)**
```json
{
  "billing": {
    "org_id": "550e8400-e29b-41d4-a716-446655440000",
    "stripe_customer_id": "cus_...",
    "stripe_subscription_id": "sub_...",
    "plan": "pro",
    "seat_limit": 10,
    "token_limit_monthly": 500000,
    "status": "active",
    "current_period_start": "2026-01-01T00:00:00Z",
    "current_period_end": "2026-02-01T00:00:00Z",
    "created_at": "2026-01-20T00:00:00Z",
    "updated_at": "2026-01-26T12:00:00Z"
  },
  "seats": {
    "used": 3,
    "limit": 10
  },
  "tokens": {
    "used": 125000,
    "limit": 500000
  }
}
```

---

### POST /billing/portal
Generate Stripe billing portal link.

**Request**
```bash
POST /api/lit/settings/billing/portal
Authorization: Bearer <token>
```

**Response (200 OK)**
```json
{
  "url": "https://billing.stripe.com/p/session/..."
}
```

Redirect user to URL to manage subscription.

---

## Usage Endpoints

### GET /usage/by-feature
Get token usage breakdown by feature.

**Request**
```bash
GET /api/lit/settings/usage/by-feature
Authorization: Bearer <token>
```

**Response (200 OK)**
```json
{
  "byFeature": {
    "search": 50000,
    "company_modal": 25000,
    "command_center": 30000,
    "rfp": 15000,
    "campaigns": 5000
  }
}
```

---

## Features Endpoints

### GET /features
List organization feature toggles.

**Request**
```bash
GET /api/lit/settings/features
Authorization: Bearer <token>
```

**Response (200 OK)**
```json
{
  "features": [
    {
      "id": "feature-001",
      "org_id": "550e8400-e29b-41d4-a716-446655440000",
      "feature_key": "advanced_search",
      "enabled": true,
      "metadata": {}
    },
    {
      "id": "feature-002",
      "org_id": "550e8400-e29b-41d4-a716-446655440000",
      "feature_key": "campaigns",
      "enabled": true,
      "metadata": {}
    }
  ]
}
```

---

## Security Endpoints

### GET /audit-logs
Get organization security audit logs.

**Query Parameters**
- `limit` (optional): Max results, default 50, max 500
- `offset` (optional): Pagination offset, default 0

**Request**
```bash
GET /api/lit/settings/audit-logs?limit=50&offset=0
Authorization: Bearer <token>
```

**Response (200 OK)**
```json
{
  "logs": [
    {
      "id": "log-001",
      "org_id": "550e8400-e29b-41d4-a716-446655440000",
      "user_id": "440e8400-e29b-41d4-a716-446655440000",
      "action": "organization_updated",
      "resource_type": "organization",
      "resource_id": "550e8400-e29b-41d4-a716-446655440000",
      "changes": {
        "name": { "old": "Old Name", "new": "New Name" }
      },
      "ip_address": "192.168.1.1",
      "user_agent": "Mozilla/5.0...",
      "status": "success",
      "created_at": "2026-01-26T12:00:00Z"
    }
  ],
  "total": 42
}
```

**Errors**
- 403: Must be owner/admin

---

## Integrations Endpoints

### GET /integrations
List connected integrations.

**Request**
```bash
GET /api/lit/settings/integrations
Authorization: Bearer <token>
```

**Response (200 OK)**
```json
{
  "integrations": [
    {
      "id": "integ-001",
      "org_id": "550e8400-e29b-41d4-a716-446655440000",
      "integration_type": "gmail",
      "name": "Gmail Account",
      "status": "connected",
      "connected_at": "2026-01-20T10:00:00Z",
      "last_sync_at": "2026-01-26T11:30:00Z",
      "error_message": null
    },
    {
      "id": "integ-002",
      "org_id": "550e8400-e29b-41d4-a716-446655440000",
      "integration_type": "slack",
      "name": "Slack Workspace",
      "status": "disconnected",
      "connected_at": null,
      "last_sync_at": null,
      "error_message": null
    }
  ]
}
```

---

### DELETE /integrations/:integration_id
Disconnect integration.

**Request**
```bash
DELETE /api/lit/settings/integrations/integ-001
Authorization: Bearer <token>
```

**Response (200 OK)**
```json
{
  "success": true
}
```

**Errors**
- 403: Must be owner/admin
- 404: Integration not found

---

## Error Codes

| Code | Meaning | HTTP Status |
|------|---------|------------|
| `unauthorized` | Missing or invalid JWT token | 401 |
| `insufficient_permissions` | User role insufficient for operation | 403 |
| `no_organization` | User not member of any organization | 404 |
| `user_already_invited_or_member` | Duplicate invitation attempt | 409 |
| `validation_error` | Request validation failed | 400 |
| `internal_error` | Server error | 500 |

---

## Rate Limiting

All endpoints subject to:
- **Limit**: 100 requests
- **Window**: 15 minutes
- **Per**: IP address

Response includes headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704067200
```

Exceeding limit returns 429 Too Many Requests.

---

## Implementation Examples

### JavaScript/TypeScript
```typescript
import { settingsApi } from '@/lib/settings';

// Get organization
const orgData = await settingsApi.organization.get();

// Update organization
await settingsApi.organization.update({
  name: 'New Name',
  industry: 'Technology'
});

// Invite team member
await settingsApi.team.members.invite('user@example.com', 'member');

// List team members
const members = await settingsApi.team.members.list();
```

### cURL
```bash
# Get organization
curl -X GET https://app.example.com/api/lit/settings/organization \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"

# Update organization
curl -X PUT https://app.example.com/api/lit/settings/organization \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"New Name"}'

# Invite user
curl -X POST https://app.example.com/api/lit/settings/team/invite \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","role":"member"}'
```

---

## Changelog

- **v1.0** (2026-01-26): Initial release with 20+ endpoints
