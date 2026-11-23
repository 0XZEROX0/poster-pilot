// "Keep answer" Code node: the post's job together with what the website answered.
return { json: Object.assign({}, $('Build').item.json, { answer: $json || {} }) };
