import { workflow, node, trigger, ifElse } from '@n8n/workflow-sdk';

const pictureHook = trigger({ type: 'n8n-nodes-base.webhook', version: 2, config: {
 "name": "Story picture from the app",
 "notes": "The story editor sends { token, postId, image (JPEG data URL, 1080x1920) }. A signed-in member only.",
 "parameters": {
  "httpMethod": "POST",
  "path": "static-os-story",
  "responseMode": "responseNode",
  "options": {
   "allowedOrigins": "https://0xzerox0.github.io",
   "onlyRunIf": "={{ typeof $json.body?.token === 'string' && $json.body.token.length > 200 && $json.body.token.length < 5000 }}"
  }
 }
} });

const whoPicture = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: {
 "name": "Who is asking (picture)",
 "onError": "continueRegularOutput",
 "parameters": {
  "method": "POST",
  "url": "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=AIzaSyAKE9xRlRdLBu3DUr6R2mtE5_duDWX1-3Q",
  "sendHeaders": true,
  "headerParameters": {
   "parameters": [
    {
     "name": "Referer",
     "value": "https://0xzerox0.github.io/"
    }
   ]
  },
  "sendBody": true,
  "contentType": "json",
  "specifyBody": "json",
  "jsonBody": "={{ { idToken: $('Story picture from the app').first().json.body.token } }}",
  "options": {
   "timeout": 20000
  }
 }
} });

const memberPicture = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: {
 "name": "Member (picture)",
 "onError": "continueRegularOutput",
 "credentials": {
  "googleApi": {
   "id": "P1HrSWrwsJZy44Ur",
   "name": "PosterPilot Firebase"
  }
 },
 "parameters": {
  "method": "GET",
  "url": "=https://firestore.googleapis.com/v1/projects/poster-pilot-8d35e/databases/(default)/documents/members/{{ (($json.users || [])[0] || {}).localId || 'nobody' }}",
  "authentication": "predefinedCredentialType",
  "nodeCredentialType": "googleApi",
  "options": {
   "timeout": 20000
  }
 }
} });

const checkPicture = node({ type: 'n8n-nodes-base.code', version: 2, config: {
 "name": "Check picture request",
 "parameters": {
  "mode": "runOnceForAllItems",
  "language": "javaScript",
  "jsCode": "// A member, a real post id, and a JPEG of a sensible size.\nconst m = $('Member (picture)').first().json || {};\nconst body = $('Story picture from the app').first().json.body || {};\nconst postId = String(body.postId || '').trim();\nconst data = String(body.image || '');\nconst b64 = data.startsWith('data:image/jpeg;base64,') ? data.slice(23) : '';\nlet error = '';\nif (!m.name || m.error) error = 'Not a member';\nelse if (!/^[A-Za-z0-9_-]{4,40}$/.test(postId)) error = 'Bad post';\nelse if (!b64 || b64.length < 1000 || b64.length > 8000000) error = 'Bad picture';\nreturn [{ json: { ok: !error, error, postId } }];\n"
 }
} });

const pictureOk = ifElse({ version: 2.2, config: {
 "name": "Picture OK?",
 "parameters": {
  "conditions": {
   "options": {
    "caseSensitive": true,
    "leftValue": "",
    "typeValidation": "loose"
   },
   "conditions": [
    {
     "leftValue": "={{ $json.ok === true }}",
     "operator": {
      "type": "boolean",
      "operation": "true",
      "singleValue": true
     }
    }
   ],
   "combinator": "and"
  },
  "options": {}
 }
} });

const findFolder = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: {
 "name": "Find Stories Folder",
 "credentials": {
  "googleDriveOAuth2Api": {
   "id": "DGga87o4UiwLGddI",
   "name": "Google Drive account"
  }
 },
 "retryOnFail": true,
 "maxTries": 3,
 "waitBetweenTries": 3000,
 "parameters": {
  "method": "GET",
  "url": "https://www.googleapis.com/drive/v3/files?q='1TnAcaZSix1Nzro-X3y-jaHpK2WmSe8pf'+in+parents+and+name+%3D+'Stories'+and+mimeType+%3D+'application/vnd.google-apps.folder'+and+trashed+%3D+false&fields=files(id)",
  "authentication": "predefinedCredentialType",
  "nodeCredentialType": "googleDriveOAuth2Api",
  "options": {
   "timeout": 60000
  }
 }
} });

const folderMissing = ifElse({ version: 2.2, config: {
 "name": "Stories folder missing?",
 "parameters": {
  "conditions": {
   "options": {
    "caseSensitive": true,
    "leftValue": "",
    "typeValidation": "loose"
   },
   "conditions": [
    {
     "leftValue": "={{ !(($json.files || [])[0] || {}).id }}",
     "operator": {
      "type": "boolean",
      "operation": "true",
      "singleValue": true
     }
    }
   ],
   "combinator": "and"
  },
  "options": {}
 }
} });

const makeFolder = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: {
 "name": "Make Stories Folder",
 "credentials": {
  "googleDriveOAuth2Api": {
   "id": "DGga87o4UiwLGddI",
   "name": "Google Drive account"
  }
 },
 "parameters": {
  "method": "POST",
  "url": "https://www.googleapis.com/drive/v3/files?fields=id",
  "authentication": "predefinedCredentialType",
  "nodeCredentialType": "googleDriveOAuth2Api",
  "sendBody": true,
  "contentType": "json",
  "specifyBody": "json",
  "jsonBody": "{\"name\":\"Stories\",\"mimeType\":\"application/vnd.google-apps.folder\",\"parents\":[\"1TnAcaZSix1Nzro-X3y-jaHpK2WmSe8pf\"]}",
  "options": {
   "timeout": 60000
  }
 }
} });

const pictureFile = node({ type: 'n8n-nodes-base.code', version: 2, config: {
 "name": "Picture file",
 "parameters": {
  "mode": "runOnceForAllItems",
  "language": "javaScript",
  "jsCode": "// The picture as a file, with the Stories folder (found, or made just now).\nconst made = $('Make Stories Folder').isExecuted ? $('Make Stories Folder').first().json.id : '';\nconst found = ((($('Find Stories Folder').first().json || {}).files || [])[0] || {}).id || '';\nconst postId = $('Check picture request').first().json.postId;\nconst b64 = String($('Story picture from the app').first().json.body.image).slice(23);\nconst name = 'story-' + postId + '-design-' + Date.now() + '.jpg';\nconst data = await this.helpers.prepareBinaryData(Buffer.from(b64, 'base64'), name, 'image/jpeg');\nreturn [{ json: { postId, folder: made || found, name }, binary: { data } }];\n"
 }
} });

const upload = node({ type: 'n8n-nodes-base.googleDrive', version: 3, config: {
 "name": "Upload Designed Story",
 "credentials": {
  "googleDriveOAuth2Api": {
   "id": "DGga87o4UiwLGddI",
   "name": "Google Drive account"
  }
 },
 "retryOnFail": true,
 "maxTries": 3,
 "waitBetweenTries": 3000,
 "parameters": {
  "name": "={{ $json.name }}",
  "driveId": {
   "__rl": true,
   "mode": "list",
   "value": "My Drive"
  },
  "folderId": {
   "__rl": true,
   "mode": "id",
   "value": "={{ $json.folder }}"
  },
  "inputDataFieldName": "data",
  "options": {}
 }
} });

const share = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: {
 "name": "Share Designed Story",
 "credentials": {
  "googleDriveOAuth2Api": {
   "id": "DGga87o4UiwLGddI",
   "name": "Google Drive account"
  }
 },
 "onError": "continueRegularOutput",
 "parameters": {
  "method": "POST",
  "url": "=https://www.googleapis.com/drive/v3/files/{{ $json.id }}/permissions",
  "authentication": "predefinedCredentialType",
  "nodeCredentialType": "googleDriveOAuth2Api",
  "sendBody": true,
  "contentType": "json",
  "specifyBody": "json",
  "jsonBody": "{ \"role\": \"reader\", \"type\": \"anyone\" }",
  "options": {
   "timeout": 60000
  }
 }
} });

const savePost = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: {
 "name": "Save On Post",
 "credentials": {
  "googleApi": {
   "id": "P1HrSWrwsJZy44Ur",
   "name": "PosterPilot Firebase"
  }
 },
 "retryOnFail": true,
 "maxTries": 3,
 "waitBetweenTries": 3000,
 "notes": "Story image = the designed picture, Story from = 'design' (the Stories part keeps it, even for a new poster).",
 "parameters": {
  "method": "PATCH",
  "url": "=https://firestore.googleapis.com/v1/projects/poster-pilot-8d35e/databases/(default)/documents/posts/{{ $('Picture file').first().json.postId }}?updateMask.fieldPaths=storyImage&updateMask.fieldPaths=ex.storyFrom&updateMask.fieldPaths=storyDesignedAt&currentDocument.exists=true",
  "authentication": "predefinedCredentialType",
  "nodeCredentialType": "googleApi",
  "sendBody": true,
  "contentType": "json",
  "specifyBody": "json",
  "jsonBody": "={{ { fields: { storyImage: { stringValue: 'https://drive.google.com/file/d/' + $('Upload Designed Story').first().json.id + '/view' }, storyDesignedAt: { integerValue: String(Date.now()) }, ex: { mapValue: { fields: { storyFrom: { stringValue: 'design' } } } } } } }}",
  "options": {
   "timeout": 60000
  }
 }
} });

const answerPicture = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.4, config: {
 "name": "Answer picture saved",
 "parameters": {
  "respondWith": "json",
  "responseBody": "={{ { ok: true, link: 'https://drive.google.com/file/d/' + $('Upload Designed Story').first().json.id + '/view' } }}",
  "options": {
   "responseHeaders": {
    "entries": [
     {
      "name": "Access-Control-Allow-Origin",
      "value": "https://0xzerox0.github.io"
     }
    ]
   }
  }
 }
} });

const refusePicture = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.4, config: {
 "name": "Refuse picture",
 "parameters": {
  "respondWith": "json",
  "responseBody": "={{ { ok: false, error: $json.error || \"Not allowed\" } }}",
  "options": {
   "responseCode": 403,
   "responseHeaders": {
    "entries": [
     {
      "name": "Access-Control-Allow-Origin",
      "value": "https://0xzerox0.github.io"
     }
    ]
   }
  }
 }
} });

const assetHook = trigger({ type: 'n8n-nodes-base.webhook', version: 2, config: {
 "name": "Picture for the editor",
 "notes": "The story editor asks { token, id } for a Drive picture (the poster) so it can draw it: the browser cannot read Drive pictures itself. Sent back as a JPEG up to 1600 px.",
 "parameters": {
  "httpMethod": "POST",
  "path": "static-os-story-asset",
  "responseMode": "responseNode",
  "options": {
   "allowedOrigins": "https://0xzerox0.github.io",
   "onlyRunIf": "={{ typeof $json.body?.token === 'string' && $json.body.token.length > 200 && $json.body.token.length < 5000 }}"
  }
 }
} });

const whoEditor = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: {
 "name": "Who is asking (editor)",
 "onError": "continueRegularOutput",
 "parameters": {
  "method": "POST",
  "url": "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=AIzaSyAKE9xRlRdLBu3DUr6R2mtE5_duDWX1-3Q",
  "sendHeaders": true,
  "headerParameters": {
   "parameters": [
    {
     "name": "Referer",
     "value": "https://0xzerox0.github.io/"
    }
   ]
  },
  "sendBody": true,
  "contentType": "json",
  "specifyBody": "json",
  "jsonBody": "={{ { idToken: $('Picture for the editor').first().json.body.token } }}",
  "options": {
   "timeout": 20000
  }
 }
} });

const memberEditor = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: {
 "name": "Member (editor)",
 "onError": "continueRegularOutput",
 "credentials": {
  "googleApi": {
   "id": "P1HrSWrwsJZy44Ur",
   "name": "PosterPilot Firebase"
  }
 },
 "parameters": {
  "method": "GET",
  "url": "=https://firestore.googleapis.com/v1/projects/poster-pilot-8d35e/databases/(default)/documents/members/{{ (($json.users || [])[0] || {}).localId || 'nobody' }}",
  "authentication": "predefinedCredentialType",
  "nodeCredentialType": "googleApi",
  "options": {
   "timeout": 20000
  }
 }
} });

const checkAsset = node({ type: 'n8n-nodes-base.code', version: 2, config: {
 "name": "Check picture ask",
 "parameters": {
  "mode": "runOnceForAllItems",
  "language": "javaScript",
  "jsCode": "// A member, and a Drive file id.\nconst m = $('Member (editor)').first().json || {};\nconst id = String(($('Picture for the editor').first().json.body || {}).id || '').trim();\nlet error = '';\nif (!m.name || m.error) error = 'Not a member';\nelse if (!/^[A-Za-z0-9_-]{20,80}$/.test(id)) error = 'Bad picture id';\nreturn [{ json: { ok: !error, error, id } }];\n"
 }
} });

const assetOk = ifElse({ version: 2.2, config: {
 "name": "Ask OK?",
 "parameters": {
  "conditions": {
   "options": {
    "caseSensitive": true,
    "leftValue": "",
    "typeValidation": "loose"
   },
   "conditions": [
    {
     "leftValue": "={{ $json.ok === true }}",
     "operator": {
      "type": "boolean",
      "operation": "true",
      "singleValue": true
     }
    }
   ],
   "combinator": "and"
  },
  "options": {}
 }
} });

const download = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: {
 "name": "Download Picture",
 "credentials": {
  "googleDriveOAuth2Api": {
   "id": "DGga87o4UiwLGddI",
   "name": "Google Drive account"
  }
 },
 "retryOnFail": true,
 "maxTries": 2,
 "waitBetweenTries": 2000,
 "parameters": {
  "method": "GET",
  "url": "=https://www.googleapis.com/drive/v3/files/{{ $json.id }}?alt=media",
  "authentication": "predefinedCredentialType",
  "nodeCredentialType": "googleDriveOAuth2Api",
  "options": {
   "timeout": 60000,
   "response": {
    "response": {
     "responseFormat": "file",
     "outputPropertyName": "data"
    }
   }
  }
 }
} });

const shrink = node({ type: 'n8n-nodes-base.editImage', version: 1, config: {
 "name": "Shrink Picture",
 "parameters": {
  "operation": "resize",
  "dataPropertyName": "data",
  "width": 1600,
  "height": 1600,
  "resizeOption": "onlyIfLarger",
  "options": {
   "format": "jpeg",
   "quality": 86
  }
 }
} });

const answerAsset = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.4, config: {
 "name": "Send picture",
 "parameters": {
  "respondWith": "binary",
  "inputDataFieldName": "data",
  "options": {
   "responseHeaders": {
    "entries": [
     {
      "name": "Access-Control-Allow-Origin",
      "value": "https://0xzerox0.github.io"
     },
     {
      "name": "Cache-Control",
      "value": "private, max-age=3600"
     }
    ]
   }
  }
 }
} });

const refuseAsk = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.4, config: {
 "name": "Refuse ask",
 "parameters": {
  "respondWith": "json",
  "responseBody": "={{ { ok: false, error: $json.error || \"Not allowed\" } }}",
  "options": {
   "responseCode": 403,
   "responseHeaders": {
    "entries": [
     {
      "name": "Access-Control-Allow-Origin",
      "value": "https://0xzerox0.github.io"
     }
    ]
   }
  }
 }
} });

export default workflow('static-os-story-editor', 'Static OS - Story editor')
  .add(pictureHook)
  .to(whoPicture)
  .to(memberPicture)
  .to(checkPicture)
  .to(pictureOk.onTrue(findFolder.to(folderMissing.onTrue(makeFolder.to(pictureFile)).onFalse(pictureFile))).onFalse(refusePicture))
  .add(pictureFile)
  .to(upload)
  .to(share)
  .to(savePost)
  .to(answerPicture)
  .add(assetHook)
  .to(whoEditor)
  .to(memberEditor)
  .to(checkAsset)
  .to(assetOk.onTrue(download.to(shrink.to(answerAsset))).onFalse(refuseAsk));
