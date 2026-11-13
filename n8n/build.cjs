const fs=require('fs');const J=f=>JSON.stringify(fs.readFileSync(__dirname+'/'+f,'utf8'));
const sheetId=process.argv[2], dry=process.argv[3]==='dry';
const out=`const everyMinute = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.2,
  config: { name: 'Every minute', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } } }
});

const settings = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Settings',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          { id: 'cfg-sheet', name: 'spreadsheetId', value: '${sheetId}', type: 'string' },
          { id: 'cfg-tab', name: 'postsSheetId', value: 0, type: 'number' },
          { id: 'cfg-project', name: 'projectId', value: 'poster-pilot-8d35e', type: 'string' },
          { id: 'cfg-dry', name: 'dryRun', value: ${dry}, type: 'boolean' }
        ]
      }
    }
  }
});

const checkMemory = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Check memory', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${J('check-memory.js')} } }
});

const getAppChanges = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Get app changes',
    parameters: {
      method: 'POST',
      url: expr("https://firestore.googleapis.com/v1/projects/{{ $('Settings').first().json.projectId }}/databases/(default)/documents:runQuery"),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ $json.query }}'),
      options: { timeout: 60000 }
    },
    credentials: { googleApi: { id: 'P1HrSWrwsJZy44Ur', name: 'PosterPilot Firebase' } },
    retryOnFail: true, maxTries: 3, waitBetweenTries: 3000
  }
});

const readSheet = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Read sheet',
    parameters: {
      method: 'GET',
      url: expr("https://sheets.googleapis.com/v4/spreadsheets/{{ $('Settings').first().json.spreadsheetId }}/values:batchGet?ranges=Posts&ranges=DB&ranges=Backgrounds!A2:A&ranges=Caption%20Templates!A:B&valueRenderOption=FORMATTED_VALUE"),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api',
      options: { timeout: 60000 }
    },
    credentials: { googleSheetsOAuth2Api: { id: 'a9IhhSL1IAi2nC78', name: 'Google Sheets account' } },
    executeOnce: true, retryOnFail: true, maxTries: 3, waitBetweenTries: 3000
  }
});

const readRowIds = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Read row ids',
    parameters: {
      method: 'POST',
      url: expr("https://sheets.googleapis.com/v4/spreadsheets/{{ $('Settings').first().json.spreadsheetId }}/developerMetadata:search"),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: '{ "dataFilters": [ { "developerMetadataLookup": { "metadataKey": "p" } } ] }',
      options: { timeout: 60000 }
    },
    credentials: { googleSheetsOAuth2Api: { id: 'a9IhhSL1IAi2nC78', name: 'Google Sheets account' } },
    executeOnce: true, retryOnFail: true, maxTries: 3, waitBetweenTries: 3000
  }
});

const planSync = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Plan sync', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${J('plan-sync.js')} } }
});

const sheetNeedsChanges = ifElse({
  version: 2.2,
  config: {
    name: 'Sheet needs changes?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.dryRun !== true && $json.sheetRequests.length > 0 }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      }
    }
  }
});

const updateSheet = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Update sheet',
    parameters: {
      method: 'POST',
      url: expr("https://sheets.googleapis.com/v4/spreadsheets/{{ $('Settings').first().json.spreadsheetId }}:batchUpdate"),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleSheetsOAuth2Api',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ { requests: $('Plan sync').first().json.sheetRequests } }}"),
      options: { timeout: 60000 }
    },
    credentials: { googleSheetsOAuth2Api: { id: 'a9IhhSL1IAi2nC78', name: 'Google Sheets account' } }
  }
});

const splitWrites = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Split Firestore writes', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${J('split-writes.js')} } }
});

const writeApp = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Write to app database',
    parameters: {
      method: 'POST',
      url: expr("https://firestore.googleapis.com/v1/projects/{{ $('Settings').first().json.projectId }}/databases/(default)/documents:batchWrite"),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ { writes: $json.writes } }}'),
      options: { timeout: 120000 }
    },
    credentials: { googleApi: { id: 'P1HrSWrwsJZy44Ur', name: 'PosterPilot Firebase' } },
    retryOnFail: true, maxTries: 2, waitBetweenTries: 3000
  }
});

const remember = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Remember what was synced', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${J('remember.js')} } }
});

export default workflow('posterpilot-sheet-sync', 'PosterPilot - Sheet and App Sync')
  .add(everyMinute)
  .to(settings)
  .to(checkMemory)
  .to(getAppChanges)
  .to(readSheet)
  .to(readRowIds)
  .to(planSync)
  .to(sheetNeedsChanges
    .onTrue(updateSheet.to(splitWrites))
    .onFalse(splitWrites))
  .add(splitWrites)
  .to(writeApp)
  .to(remember)
  .group('Read both sides', [settings, checkMemory, getAppChanges, readSheet, readRowIds], { description: 'Reads the changes waiting in the app, the Posts sheet, and the hidden id tag of each row.' })
  .group('Plan and update the sheet', [planSync, sheetNeedsChanges, updateSheet, splitWrites], { description: 'Works out what differs. Writes app changes and new app posts into the sheet.' })
  .group('Update the app', [writeApp, remember], { description: 'Sends changed posts, product list and a heartbeat to the app database.' });
`;
fs.writeFileSync(__dirname+'/workflow.sdk.js',out);console.log(out.length);
