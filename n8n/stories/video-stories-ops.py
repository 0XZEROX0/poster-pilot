import json, copy
W=json.load(open('sched.json (get_workflow_details output)'))['workflow']
N={n['name']:n for n in W['nodes']}
PAGE='242283423247894'; IG='17841412599288361'; G='https://graph.facebook.com/v26.0/'
META={'authentication':'genericCredentialType','genericAuthType':'httpHeaderAuth'}
MCRED={'httpHeaderAuth':{'id':'mkgnFIzTWTgamXBY','name':'Meta Page Token'}}
GCRED={'googleApi':{'id':'P1HrSWrwsJZy44Ur','name':'PosterPilot Firebase'}}
ops=[]
def add(name,typ,ver,pos,params,creds=None,notes=None):
    n={'name':name,'type':typ,'typeVersion':ver,'position':pos,'parameters':params}
    if creds: n['credentials']=creds
    if notes: n['notes']=notes
    ops.append({'type':'addNode','node':n})
def settings(name,**s): ops.append({'type':'setNodeSettings','nodeName':name,'settings':s})
def con(a,b,i=0): ops.append({'type':'addConnection','source':a,'target':b,'sourceIndex':i})
def uncon(a,b,i=0): ops.append({'type':'removeConnection','source':a,'target':b,'sourceIndex':i})
def graph(name,pos,method,url,body=None,notes=None):
    p=dict(method=method,url=url,**META)
    if body: p.update(sendBody=True,contentType='json',specifyBody='json',jsonBody=body)
    p['options']={'timeout':120000}
    add(name,'n8n-nodes-base.httpRequest',4.2,pos,p,MCRED,notes)
def store(name,pos,cols,idexpr):
    p=copy.deepcopy(N['Save Facebook Story']['parameters'])
    p['workflowInputs']['value'].update(cols=cols,id=idexpr)
    add(name,'n8n-nodes-base.executeWorkflow',N['Save Facebook Story']['typeVersion'],pos,p)
def code(name,pos,js,notes=None):
    add(name,'n8n-nodes-base.code',2,pos,{'mode':'runOnceForAllItems','language':'javaScript','jsCode':js},None,notes)
def ifn(name,pos,expr):
    add(name,'n8n-nodes-base.if',2.2,pos,{'conditions':{'options':{'caseSensitive':True,'leftValue':'','typeValidation':'loose'},'combinator':'and','conditions':[{'leftValue':expr,'operator':{'type':'boolean','operation':'true','singleValue':True}}]},'options':{}})
def lookup(name,pos):
    add(name,'n8n-nodes-base.httpRequest',4.2,pos,{'method':'GET','url':"=https://firestore.googleapis.com/v1/projects/poster-pilot-8d35e/databases/(default)/documents/posts/{{ $json.id }}?mask.fieldPaths=storyVideo",'authentication':'predefinedCredentialType','nodeCredentialType':'googleApi','options':{'timeout':30000}},GCRED,'Does this story have a video (a moving story from the editor)? One small read per due story.')
    settings(name,onError='continueRegularOutput',alwaysOutputData=True,retryOnFail=True,maxTries=2,waitBetweenTries=2000)
KIND="// The planned story plus the video's Drive id, when the story was designed as a moving story.\nconst plans = %s;\nreturn $input.all().map((it, n) => {\n  const v = String((((it.json || {}).fields || {}).storyVideo || {}).stringValue || '');\n  const m = v.match(/\\/d\\/([\\w-]+)/);\n  return { json: Object.assign({}, (plans[n] || {}).json || {}, { videoId: m ? m[1] : '' }), pairedItem: { item: n } };\n});\n"
LINK="'https://drive.usercontent.google.com/download?id=' + $json.videoId + '&export=download&confirm=t'"
err=lambda label: "(" + label + " + ': ' + String((($json.error || {}).message) || $json.error || 'unknown').slice(0, 180))"
noRetry=dict(retryOnFail=False,onError='continueErrorOutput')
x0,y=0,6200
at=lambda c,r:[x0+c*224,y+r*200]
# ---- Facebook ----
lookup('Look up story video (Facebook)',at(4,0))
code('Facebook story kind',at(5,0),KIND % "$('Facebook stories now').all()")
ifn('Video story? (Facebook)',at(6,0),"={{ !!$json.videoId }}")
graph('Start Facebook Video Story',at(7,0),'POST',G+PAGE+'/video_stories','={{ { upload_phase: "start" } }}','Starts a Facebook Page video story (the moving story from the editor). No retry.')
settings('Start Facebook Video Story',**noRetry)
add('Send Facebook Story Video','n8n-nodes-base.httpRequest',4.2,at(8,0),dict(method='POST',url='={{ $json.upload_url }}',**META,sendHeaders=True,headerParameters={'parameters':[{'name':'file_url','value':"={{ 'https://drive.usercontent.google.com/download?id=' + $('Facebook story kind').item.json.videoId + '&export=download&confirm=t' }}"}]},options={'timeout':120000}),MCRED,'Facebook fetches the MP4 from its Drive link (shared: anyone with the link). No retry.')
settings('Send Facebook Story Video',**noRetry)
graph('Finish Facebook Video Story',at(9,0),'POST',G+PAGE+'/video_stories',"={{ { upload_phase: 'finish', video_id: $('Start Facebook Video Story').item.json.video_id } }}",'Publishes the Facebook video story. No retry: a retry could post it twice.')
settings('Finish Facebook Video Story',**noRetry)
store('Save Facebook Video Story',at(10,0),"={{ { 'Story FB status': 'Posted', 'Story FB id': String($json.post_id || $('Start Facebook Video Story').item.json.video_id || '') } }}","={{ $('Facebook story kind').item.json.id }}")
store('Save Facebook Video Error',at(10,1),"={{ { 'Story FB status': "+err("'Facebook error'")+" } }}","={{ $('Facebook story kind').item.json.id }}")
uncon('Facebook stories now','Download Story Picture (Facebook)')
con('Facebook stories now','Look up story video (Facebook)'); con('Look up story video (Facebook)','Facebook story kind'); con('Facebook story kind','Video story? (Facebook)')
con('Video story? (Facebook)','Start Facebook Video Story',0); con('Video story? (Facebook)','Download Story Picture (Facebook)',1)
for a,b in [('Start Facebook Video Story','Send Facebook Story Video'),('Send Facebook Story Video','Finish Facebook Video Story'),('Finish Facebook Video Story','Save Facebook Video Story')]:
    con(a,b,0); con(a,'Save Facebook Video Error',1)
# ---- Instagram ----
lookup('Look up story video (Instagram)',at(4,3))
code('Instagram story kind',at(5,3),KIND % "$('Under Instagram limit').all()")
ifn('Video story? (Instagram)',at(6,3),"={{ !!$json.videoId }}")
graph('Create Instagram Video Story',at(7,3),'POST',G+IG+'/media',"={{ { media_type: 'STORIES', video_url: "+LINK+" } }}",'Creates the Instagram video story from the MP4 Drive link. No retry.')
settings('Create Instagram Video Story',**noRetry)
add('Wait For Instagram Video','n8n-nodes-base.wait',1.1,at(8,3),{'resume':'timeInterval','amount':30,'unit':'seconds'})
graph('Instagram Video Ready?',at(9,3),'GET',"="+G+"{{ $('Create Instagram Video Story').item.json.id }}?fields=status_code",None,'FINISHED when Instagram has processed the video.')
settings('Instagram Video Ready?',onError='continueRegularOutput',alwaysOutputData=True,retryOnFail=True,maxTries=2,waitBetweenTries=3000)
ifn('Video processed?',at(10,3),"={{ $json.status_code === 'FINISHED' }}")
add('Wait Longer For Instagram Video','n8n-nodes-base.wait',1.1,at(11,4),{'resume':'timeInterval','amount':60,'unit':'seconds'})
graph('Publish Instagram Video Story',at(12,3),'POST',G+IG+'/media_publish',"={{ { creation_id: $('Create Instagram Video Story').item.json.id } }}",'Publishes the Instagram video story. No retry: a retry could post it twice.')
settings('Publish Instagram Video Story',**noRetry)
store('Save Instagram Video Story',at(13,3),"={{ { 'Story IG status': 'Posted', 'Story IG id': String($json.id || '') } }}","={{ $('Instagram story kind').item.json.id }}")
store('Save Instagram Video Error',at(13,4),"={{ { 'Story IG status': "+err("'Instagram error'")+" } }}","={{ $('Instagram story kind').item.json.id }}")
uncon('Instagram limit reached?','Download Story Picture (Instagram)',1)
con('Instagram limit reached?','Look up story video (Instagram)',1); con('Look up story video (Instagram)','Instagram story kind'); con('Instagram story kind','Video story? (Instagram)')
con('Video story? (Instagram)','Create Instagram Video Story',0); con('Video story? (Instagram)','Download Story Picture (Instagram)',1)
con('Create Instagram Video Story','Wait For Instagram Video',0); con('Create Instagram Video Story','Save Instagram Video Error',1)
con('Wait For Instagram Video','Instagram Video Ready?'); con('Instagram Video Ready?','Video processed?')
con('Video processed?','Publish Instagram Video Story',0); con('Video processed?','Wait Longer For Instagram Video',1)
con('Wait Longer For Instagram Video','Publish Instagram Video Story')
con('Publish Instagram Video Story','Save Instagram Video Story',0); con('Publish Instagram Video Story','Save Instagram Video Error',1)
new=[o['node']['name'] for o in ops if o['type']=='addNode']
grp=[g for g in W['nodeGroups'] if g['name']=='Stories'][0]
ops.append({'type':'updateNodeGroup','groupName':'Stories','nodeNames':grp['nodeNames']+new})
print(len(ops)); json.dump(ops,open('video-stories-ops.json','w'))
