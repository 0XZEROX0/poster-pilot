# Poster builder (n8n "Static OS - Build Posters", fxLNBzuRpZjweUgr)

`multi-item-layout.js` is the code of the "Multi Item Layout" Code node: it places 2-4 products on one poster.
Posts with versions of one product (`post.variants`, up to 4 items) show the shared name once, a smaller line with
the versions, and for 4 items a grid / staggered stack. The Posts store gives each row read-only columns
`Title`, `Options` and `Variants` (see `n8n/direct/lib.js`, `variantsOf`).
