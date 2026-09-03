export function Card({inverse, headline, accentWord, meta, children, style}) {
  return React.createElement('div', {style:{background:inverse?'var(--black)':'var(--white)', color:inverse?'var(--white)':'var(--black)', border:inverse?'none':'2px solid var(--black)', borderRadius:0, padding:24, display:'flex', flexDirection:'column', justifyContent:'space-between', gap:16, ...style}},
    React.createElement('div', {style:{fontFamily:'var(--font-display)', textTransform:'uppercase', fontSize:30, lineHeight:.95}}, headline, accentWord && [' ', React.createElement('span',{key:'a',style:{color:'var(--red)'}}, accentWord)]),
    children,
    meta && React.createElement('div', {style:{fontFamily:'var(--font-body)', fontSize:13, fontWeight:700, letterSpacing:'.14em', textTransform:'uppercase', color:inverse?'rgba(255,255,255,.78)':'rgba(0,0,0,.72)'}}, meta));
}