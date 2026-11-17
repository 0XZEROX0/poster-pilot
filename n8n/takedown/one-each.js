// "One post each" Code node: the posts this run claimed (the claim of a post another run changed meanwhile fails
// its precondition and is left alone), one item each.
const plan = $('Plan').first().json;
const status = $json.status || [];
return plan.posts.filter((p, i) => !status[i] || !status[i].code).map(p => ({ json: p }));
