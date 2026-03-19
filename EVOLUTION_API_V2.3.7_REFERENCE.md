# Evolution API v2.3.7 - Complete Endpoint Documentation

> **Source**: Evolution API v2.3.* Postman Collection  
> **API Version**: 2.3.7  
> **Base URL**: `https://your-domain.com` (replace with your Evolution API server URL)  
> **Authentication**: All requests require an `apikey` header

## Table of Contents

1. [Authentication](#authentication)
2. [Instance Management](#instance-management)
3. [Send Message Operations](#send-message-operations)
4. [Chat Operations](#chat-operations)
5. [Contact Operations](#contact-operations)
6. [Group Operations](#group-operations)
7. [Label Operations](#label-operations)
8. [Settings Management](#settings-management)
9. [Webhook Configuration](#webhook-configuration)
10. [Integration Services](#integration-services)
11. [Profile Operations](#profile-operations)
12. [Media Operations](#media-operations)
13. [Proxy Configuration](#proxy-configuration)
14. [Webhook Events Reference](#webhook-events-reference)

---

## Authentication

All API requests require authentication using an API key passed in the request headers.

### Headers

```json
{
  "apikey": "your-api-key-here"
}
```

- For instance-level operations: Use instance-specific API key
- For global operations: Use global API key from ENV file

---

## Instance Management

### 1. Create Instance

Create a new WhatsApp instance with comprehensive configuration options.

**Endpoint**: `POST /instance/create`

**Headers**:
```json
{
  "apikey": "globalApikey"
}
```

**Request Body**:
```json
{
  "instanceName": "my_instance",
  "token": "custom-api-key",
  "number": "5511999999999",
  "qrcode": true,
  "integration": "WHATSAPP-BAILEYS",
  
  "rejectCall": false,
  "msgCall": "",
  "groupsIgnore": false,
  "alwaysOnline": false,
  "readMessages": false,
  "readStatus": false,
  "syncFullHistory": false,
  
  "proxyHost": "",
  "proxyPort": "",
  "proxyProtocol": "",
  "proxyUsername": "",
  "proxyPassword": "",
  
  "webhook": {
    "url": "https://your-webhook-url.com",
    "byEvents": false,
    "base64": true,
    "headers": {
      "authorization": "Bearer TOKEN",
      "Content-Type": "application/json"
    },
    "events": [
      "APPLICATION_STARTUP",
      "QRCODE_UPDATED",
      "MESSAGES_SET",
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "MESSAGES_DELETE",
      "SEND_MESSAGE",
      "CONTACTS_SET",
      "CONTACTS_UPSERT",
      "CONTACTS_UPDATE",
      "PRESENCE_UPDATE",
      "CHATS_SET",
      "CHATS_UPSERT",
      "CHATS_UPDATE",
      "CHATS_DELETE",
      "GROUPS_UPSERT",
      "GROUP_UPDATE",
      "GROUP_PARTICIPANTS_UPDATE",
      "CONNECTION_UPDATE",
      "LABELS_EDIT",
      "LABELS_ASSOCIATION",
      "CALL",
      "TYPEBOT_START",
      "TYPEBOT_CHANGE_STATUS"
    ]
  },
  
  "rabbitmq": {
    "enabled": true,
    "events": [
      "APPLICATION_STARTUP",
      "QRCODE_UPDATED",
      "MESSAGES_UPSERT",
      "SEND_MESSAGE",
      "CONNECTION_UPDATE"
    ]
  },
  
  "sqs": {
    "enabled": true,
    "events": [
      "APPLICATION_STARTUP",
      "QRCODE_UPDATED",
      "MESSAGES_UPSERT"
    ]
  },
  
  "chatwootAccountId": "1",
  "chatwootToken": "TOKEN",
  "chatwootUrl": "https://chatwoot.com",
  "chatwootSignMsg": true,
  "chatwootReopenConversation": true,
  "chatwootConversationPending": false,
  "chatwootImportContacts": true,
  "chatwootNameInbox": "evolution",
  "chatwootMergeBrazilContacts": true,
  "chatwootImportMessages": true,
  "chatwootDaysLimitImportMessages": 3,
  "chatwootOrganization": "Evolution Bot",
  "chatwootLogo": "https://evolution-api.com/files/evolution-api-favicon.png"
}
```

**Field Descriptions**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `instanceName` | string | Yes | Unique name for the instance |
| `token` | string | No | Custom API key (auto-generated if empty) |
| `number` | string | No | Phone number with country code |
| `qrcode` | boolean | No | Enable QR code generation |
| `integration` | string | No | Integration type: `WHATSAPP-BAILEYS`, `WHATSAPP-BUSINESS`, or `EVOLUTION` |
| `rejectCall` | boolean | No | Auto-reject incoming calls |
| `msgCall` | string | No | Message to send when rejecting calls |
| `groupsIgnore` | boolean | No | Ignore group messages |
| `alwaysOnline` | boolean | No | Keep instance always online |
| `readMessages` | boolean | No | Auto-read messages |
| `readStatus` | boolean | No | Auto-read status updates |
| `syncFullHistory` | boolean | No | Sync full message history |

**Response Example**:
```json
{
  "instance": {
    "instanceName": "my_instance",
    "instanceId": "uuid-here",
    "status": "created",
    "qrcode": {
      "code": "base64-qr-code",
      "base64": "data:image/png;base64,..."
    }
  },
  "hash": {
    "apikey": "generated-api-key"
  }
}
```

---

### 2. Fetch Instances

Retrieve information about existing instances.

**Endpoint**: `GET /instance/fetchInstances`

**Headers**:
```json
{
  "apikey": "your-api-key"
}
```

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `instanceName` | string | No | Filter by instance name |
| `instanceId` | string | No | Filter by instance ID |

**Response Example**:
```json
[
  {
    "instanceName": "my_instance",
    "instanceId": "uuid-here",
    "status": "open",
    "serverUrl": "https://your-domain.com",
    "apikey": "instance-api-key",
    "owner": "owner-name",
    "profileName": "Profile Name",
    "profilePictureUrl": "https://...",
    "integration": "WHATSAPP-BAILEYS"
  }
]
```

---

### 3. Connect Instance

Get QR code for connecting an instance.

**Endpoint**: `GET /instance/connect/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key"
}
```

**URL Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `instanceName` | string | Yes | Name of the instance |

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `number` | string | No | Phone number with country code |

**Response Example**:
```json
{
  "code": "qr-code-string",
  "base64": "data:image/png;base64,..."
}
```

---

### 4. Restart Instance

Restart a WhatsApp instance.

**Endpoint**: `POST /instance/restart/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key"
}
```

**URL Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `instanceName` | string | Yes | Name of the instance |

**Response Example**:
```json
{
  "status": "restarted",
  "instanceName": "my_instance"
}
```

---

### 5. Set Presence

Set the online/offline status of an instance.

**Endpoint**: `POST /instance/setPresence/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key"
}
```

**URL Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `instanceName` | string | Yes | Name of the instance |

**Request Body**:
```json
{
  "presence": "available"
}
```

**Presence Options**:
- `available` - Show as online
- `unavailable` - Show as offline

**Response Example**:
```json
{
  "status": "success",
  "presence": "available"
}
```

---

### 6. Connection Status

Check the connection status of an instance.

**Endpoint**: `GET /instance/connectionState/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key"
}
```

**URL Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `instanceName` | string | Yes | Name of the instance |

**Response Example**:
```json
{
  "instance": "my_instance",
  "state": "open",
  "statusReason": 200
}
```

**Connection States**:
- `close` - Connection closed
- `connecting` - Attempting to connect
- `open` - Connected and ready

---

### 7. Logout Instance

Logout from WhatsApp (disconnect without deleting).

**Endpoint**: `DELETE /instance/logout/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key"
}
```

**URL Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `instanceName` | string | Yes | Name of the instance |

**Response Example**:
```json
{
  "status": "logged out",
  "instanceName": "my_instance"
}
```

---

### 8. Delete Instance

Permanently delete an instance.

**Endpoint**: `DELETE /instance/delete/{instanceName}`

**Headers**:
```json
{
  "apikey": "globalApikey"
}
```

**URL Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `instanceName` | string | Yes | Name of the instance |

**Response Example**:
```json
{
  "status": "deleted",
  "instanceName": "my_instance"
}
```

---

## Send Message Operations

### 1. Send Text Message

Send a simple text message or text with mentions.

**Endpoint**: `POST /message/sendText/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key"
}
```

**URL Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `instanceName` | string | Yes | Name of the instance |

**Request Body**:
```json
{
  "number": "5511999999999",
  "text": "Hello, this is a test message",
  
  "delay": 1200,
  
  "quoted": {
    "key": {
      "id": "MESSAGE_ID"
    },
    "message": {
      "conversation": "CONTENT_MESSAGE"
    }
  },
  
  "linkPreview": false,
  "mentionsEveryOne": false,
  "mentioned": [
    "5511888888888"
  ]
}
```

**Field Descriptions**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `number` | string | Yes | Recipient number with country code |
| `text` | string | Yes | Message text content |
| `delay` | number | No | Delay in milliseconds before sending |
| `quoted` | object | No | Quote/reply to a specific message |
| `linkPreview` | boolean | No | Enable link preview in message |
| `mentionsEveryOne` | boolean | No | Mention everyone in group |
| `mentioned` | array | No | Array of numbers to mention |

**Response Example**:
```json
{
  "key": {
    "remoteJid": "5511999999999@s.whatsapp.net",
    "fromMe": true,
    "id": "MESSAGE_ID"
  },
  "message": {
    "conversation": "Hello, this is a test message"
  },
  "messageTimestamp": 1234567890,
  "status": "PENDING"
}
```

---

### 2. Send Media (URL)

Send image, video, or document from a URL.

**Endpoint**: `POST /message/sendMedia/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key",
  "Content-Type": "application/json"
}
```

**URL Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `instanceName` | string | Yes | Name of the instance |

**Request Body**:
```json
{
  "number": "5511999999999",
  "mediatype": "image",
  "mimetype": "image/png",
  "caption": "Check out this image",
  "media": "https://example.com/image.png",
  "fileName": "image.png",
  
  "delay": 1200,
  
  "quoted": {
    "key": {
      "id": "MESSAGE_ID"
    },
    "message": {
      "conversation": "CONTENT_MESSAGE"
    }
  },
  
  "mentionsEveryOne": false,
  "mentioned": [
    "5511888888888"
  ]
}
```

**Field Descriptions**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `number` | string | Yes | Recipient number with country code |
| `mediatype` | string | Yes | Type: `image`, `video`, or `document` |
| `mimetype` | string | Yes | MIME type of the media |
| `caption` | string | No | Caption for the media |
| `media` | string | Yes | URL or base64 encoded media |
| `fileName` | string | No | Name of the file |
| `delay` | number | No | Delay in milliseconds before sending |

**Media Types**:
- `image` - Send images (PNG, JPEG, etc.)
- `video` - Send video files
- `document` - Send documents (PDF, DOCX, etc.)

**Response Example**:
```json
{
  "key": {
    "remoteJid": "5511999999999@s.whatsapp.net",
    "fromMe": true,
    "id": "MESSAGE_ID"
  },
  "message": {
    "imageMessage": {
      "url": "...",
      "mimetype": "image/png",
      "caption": "Check out this image"
    }
  },
  "messageTimestamp": 1234567890,
  "status": "PENDING"
}
```

---

### 3. Send Media (File Upload)

Send media by uploading a file directly.

**Endpoint**: `POST /message/sendMedia/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key",
  "Content-Type": "multipart/form-data"
}
```

**URL Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `instanceName` | string | Yes | Name of the instance |

**Form Data**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `number` | string | Yes | Recipient number with country code |
| `mediatype` | string | Yes | Type: `image`, `video`, or `document` |
| `caption` | string | No | Caption for the media |
| `media` | file | Yes | The media file to upload |

**Response**: Same as Send Media (URL)

---

### 4. Send Location

Send a location message with coordinates.

**Endpoint**: `POST /message/sendLocation/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key"
}
```

**Request Body**:
```json
{
  "number": "5511999999999",
  "name": "My Location",
  "address": "123 Main St, City, Country",
  "latitude": -23.550520,
  "longitude": -46.633308
}
```

---

### 5. Send Contact

Send a contact card (vCard).

**Endpoint**: `POST /message/sendContact/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key"
}
```

**Request Body**:
```json
{
  "number": "5511999999999",
  "contact": [
    {
      "fullName": "John Doe",
      "wuid": "5511888888888",
      "phoneNumber": "5511888888888",
      "organization": "Company Name"
    }
  ]
}
```

---

### 6. Send Reaction

React to a message with an emoji.

**Endpoint**: `POST /message/sendReaction/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key"
}
```

**Request Body**:
```json
{
  "reactionMessage": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "MESSAGE_ID"
    },
    "reaction": "👍"
  }
}
```

---

### 7. Send Poll

Create and send a poll message.

**Endpoint**: `POST /message/sendPoll/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key"
}
```

**Request Body**:
```json
{
  "number": "5511999999999",
  "name": "What's your favorite color?",
  "selectableCount": 1,
  "values": [
    "Red",
    "Blue",
    "Green",
    "Yellow"
  ]
}
```

**Field Descriptions**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `number` | string | Yes | Recipient number or group JID |
| `name` | string | Yes | Poll question |
| `selectableCount` | number | Yes | Number of options users can select |
| `values` | array | Yes | Array of poll options |

---

## Chat Operations

### 1. Fetch Chats

Get all chats for an instance.

**Endpoint**: `GET /chat/findChats/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key"
}
```

**Response Example**:
```json
[
  {
    "id": "5511999999999@s.whatsapp.net",
    "name": "Contact Name",
    "unreadCount": 5,
    "lastMessage": {
      "message": "Last message text",
      "messageTimestamp": 1234567890
    },
    "isGroup": false
  }
]
```

---

### 2. Fetch Messages

Get messages from a specific chat.

**Endpoint**: `GET /chat/findMessages/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key"
}
```

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `remoteJid` | string | Yes | Chat JID (number@s.whatsapp.net or group JID) |
| `limit` | number | No | Number of messages to fetch |
| `page` | number | No | Page number for pagination |

**Response Example**:
```json
{
  "messages": [
    {
      "key": {
        "remoteJid": "5511999999999@s.whatsapp.net",
        "fromMe": false,
        "id": "MESSAGE_ID"
      },
      "message": {
        "conversation": "Message text"
      },
      "messageTimestamp": 1234567890
    }
  ],
  "total": 100
}
```

---

### 3. Delete Message

Delete a message for everyone.

**Endpoint**: `DELETE /chat/deleteMessage/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key"
}
```

**Request Body**:
```json
{
  "remoteJid": "5511999999999@s.whatsapp.net",
  "id": "MESSAGE_ID",
  "fromMe": true
}
```

---

### 4. Mark Chat as Read

Mark all messages in a chat as read.

**Endpoint**: `POST /chat/markChatAsRead/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key"
}
```

**Request Body**:
```json
{
  "remoteJid": "5511999999999@s.whatsapp.net"
}
```

---

## Contact Operations

### 1. Fetch Contacts

Get all contacts for an instance.

**Endpoint**: `GET /contact/findContacts/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key"
}
```

**Response Example**:
```json
[
  {
    "id": "5511999999999@s.whatsapp.net",
    "name": "Contact Name",
    "notify": "Contact Nickname",
    "verifiedName": "Verified Name",
    "imgUrl": "https://...",
    "status": "Status message"
  }
]
```

---

### 2. Get Profile Picture

Get contact's profile picture URL.

**Endpoint**: `GET /contact/profilePicture/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key"
}
```

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `number` | string | Yes | Contact number with country code |

**Response Example**:
```json
{
  "profilePictureUrl": "https://pps.whatsapp.net/..."
}
```

---

### 3. Check WhatsApp

Check if a number has WhatsApp.

**Endpoint**: `GET /contact/checkWhatsApp/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key"
}
```

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `numbers` | string | Yes | Comma-separated numbers with country code |

**Response Example**:
```json
[
  {
    "number": "5511999999999",
    "exists": true,
    "jid": "5511999999999@s.whatsapp.net"
  },
  {
    "number": "5511888888888",
    "exists": false
  }
]
```

---

## Group Operations

### 1. Create Group

Create a new WhatsApp group.

**Endpoint**: `POST /group/create/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key"
}
```

**Request Body**:
```json
{
  "subject": "Group Name",
  "description": "Group description",
  "participants": [
    "5511999999999",
    "5511888888888"
  ]
}
```

**Response Example**:
```json
{
  "id": "GROUP_JID@g.us",
  "subject": "Group Name",
  "creation": 1234567890,
  "owner": "5511777777777@s.whatsapp.net",
  "participants": [...]
}
```

---

### 2. Update Participants

Add or remove participants from a group.

**Endpoint**: `POST /group/updateParticipants/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key"
}
```

**Request Body**:
```json
{
  "groupJid": "GROUP_JID@g.us",
  "action": "add",
  "participants": [
    "5511999999999",
    "5511888888888"
  ]
}
```

**Actions**:
- `add` - Add participants to group
- `remove` - Remove participants from group
- `promote` - Promote to admin
- `demote` - Remove admin privileges

---

## Settings Management

### 1. Set Settings

Configure instance settings.

**Endpoint**: `POST /settings/set/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key"
}
```

**Request Body**:
```json
{
  "rejectCall": true,
  "msgCall": "I do not accept calls",
  "groupsIgnore": false,
  "alwaysOnline": true,
  "readMessages": false,
  "syncFullHistory": false,
  "readStatus": false
}
```

**Settings Description**:

| Field | Type | Description |
|-------|------|-------------|
| `rejectCall` | boolean | Automatically reject incoming calls |
| `msgCall` | string | Message to send when rejecting calls |
| `groupsIgnore` | boolean | Ignore messages from groups |
| `alwaysOnline` | boolean | Keep online status always visible |
| `readMessages` | boolean | Automatically mark messages as read |
| `syncFullHistory` | boolean | Sync full message history on connect |
| `readStatus` | boolean | Automatically read status updates |

---

## Webhook Configuration

### 1. Set Webhook

Configure webhook for receiving events.

**Endpoint**: `POST /webhook/set/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key"
}
```

**Request Body**:
```json
{
  "enabled": true,
  "url": "https://your-webhook-url.com/webhook",
  "webhookByEvents": false,
  "webhookBase64": true,
  "headers": {
    "authorization": "Bearer YOUR_TOKEN",
    "Content-Type": "application/json"
  },
  "events": [
    "APPLICATION_STARTUP",
    "QRCODE_UPDATED",
    "MESSAGES_SET",
    "MESSAGES_UPSERT",
    "MESSAGES_UPDATE",
    "MESSAGES_DELETE",
    "SEND_MESSAGE",
    "CONTACTS_SET",
    "CONTACTS_UPSERT",
    "CONTACTS_UPDATE",
    "PRESENCE_UPDATE",
    "CHATS_SET",
    "CHATS_UPSERT",
    "CHATS_UPDATE",
    "CHATS_DELETE",
    "GROUPS_UPSERT",
    "GROUP_UPDATE",
    "GROUP_PARTICIPANTS_UPDATE",
    "CONNECTION_UPDATE",
    "LABELS_EDIT",
    "LABELS_ASSOCIATION",
    "CALL",
    "TYPEBOT_START",
    "TYPEBOT_CHANGE_STATUS"
  ]
}
```

---

## Media Operations

### 1. Get Media Base64

Download media from a message and get it as base64.

**Endpoint**: `POST /chat/getBase64FromMediaMessage/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key"
}
```

**Request Body**:
```json
{
  "message": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "MESSAGE_ID"
    }
  },
  "convertToMp4": false
}
```

**Field Descriptions**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message.key` | object | Yes | Message key information |
| `convertToMp4` | boolean | No | Convert media to MP4 (for videos) |

**Response Example**:
```json
{
  "mediaType": "image",
  "fileName": "image.jpg",
  "caption": "Image caption",
  "size": 123456,
  "mimetype": "image/jpeg",
  "base64": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
}
```

---

## Profile Operations

### 1. Update Profile Name

Update the instance's profile name.

**Endpoint**: `POST /profile/updateProfileName/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key"
}
```

**Request Body**:
```json
{
  "name": "My New Profile Name"
}
```

---

### 2. Fetch Profile

Get instance profile information.

**Endpoint**: `GET /profile/fetchProfile/{instanceName}`

**Headers**:
```json
{
  "apikey": "instance-api-key"
}
```

**Response Example**:
```json
{
  "wuid": "5511777777777",
  "name": "Profile Name",
  "status": "Status message",
  "profilePictureUrl": "https://..."
}
```

---

## Webhook Events Reference

Evolution API supports the following webhook events:

### Instance Events

| Event | Description |
|-------|-------------|
| `APPLICATION_STARTUP` | Fired when application starts |
| `QRCODE_UPDATED` | Fired when QR code is generated or updated |
| `CONNECTION_UPDATE` | Fired when instance connection state changes |

### Message Events

| Event | Description |
|-------|-------------|
| `MESSAGES_SET` | Fired when initial messages are loaded |
| `MESSAGES_UPSERT` | Fired when new messages are received or sent |
| `MESSAGES_UPDATE` | Fired when messages are updated (edited, deleted, etc.) |
| `MESSAGES_DELETE` | Fired when messages are deleted |
| `SEND_MESSAGE` | Fired when a message is successfully sent |

### Contact Events

| Event | Description |
|-------|-------------|
| `CONTACTS_SET` | Fired when initial contacts are loaded |
| `CONTACTS_UPSERT` | Fired when contacts are added or updated |
| `CONTACTS_UPDATE` | Fired when contact information is updated |

### Chat Events

| Event | Description |
|-------|-------------|
| `CHATS_SET` | Fired when initial chats are loaded |
| `CHATS_UPSERT` | Fired when chats are added or updated |
| `CHATS_UPDATE` | Fired when chat information is updated |
| `CHATS_DELETE` | Fired when chats are deleted |

### Group Events

| Event | Description |
|-------|-------------|
| `GROUPS_UPSERT` | Fired when groups are created or updated |
| `GROUP_UPDATE` | Fired when group information is updated |
| `GROUP_PARTICIPANTS_UPDATE` | Fired when group participants change |

### Other Events

| Event | Description |
|-------|-------------|
| `PRESENCE_UPDATE` | Fired when contact presence status changes |
| `LABELS_EDIT` | Fired when labels are created, updated, or deleted |
| `LABELS_ASSOCIATION` | Fired when labels are associated with chats |
| `CALL` | Fired when incoming calls are received |
| `TYPEBOT_START` | Fired when Typebot conversation starts |
| `TYPEBOT_CHANGE_STATUS` | Fired when Typebot status changes |

---

## Important Notes

### Number Format

All phone numbers must be in international format without special characters:
- ✅ Correct: `5511999999999` (Country code + area code + number)
- ❌ Wrong: `+55 11 99999-9999` or `(11) 99999-9999`

### Message Types

Evolution API supports multiple message types:
- Text messages (with formatting)
- Media messages (image, video, audio, document)
- Interactive messages (buttons, lists, polls)
- Location messages
- Contact cards (vCard)
- Stickers
- Reactions

### Rate Limiting

Be mindful of WhatsApp's rate limits:
- Don't send too many messages too quickly
- Use the `delay` parameter to space out messages
- Monitor your sending patterns to avoid blocks

### Media Handling

- Media can be sent via URL or base64
- Supported formats: JPEG, PNG, MP4, PDF, MP3, WebP, etc.
- Large media files should be sent via URL for better performance
- Base64 is convenient for small files but increases payload size

### Error Handling

All endpoints return standard HTTP status codes:
- `200` - Success
- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized (invalid API key)
- `404` - Not Found (instance or resource not found)
- `500` - Internal Server Error

---

**Last Updated**: February 10, 2026  
**API Version**: 2.3.7  
**Document Version**: 1.0
