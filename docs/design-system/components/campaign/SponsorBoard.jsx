export function SponsorBoard({title='Thank you to our sponsors.', sponsors=[], style}) {
  return React.createElement('div', {style:{background:'var(--black)', color:'var(--white)', padding:28, borderRadius:0, ...style}},
    React.createElement('div', {style:{fontFamily:'var(--font-display)', fontSize:30, lineHeight:.95, textTransform:'uppercase', maxWidth:220, marginBottom:20}}, title),
    React.createElement('div', {style:{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px 24px'}},
      sponsors.map((s,i)=>React.createElement('div', {key:i, style:{fontFamily:'var(--font-body)', fontSize:14, fontWeight:800, letterSpacing:'.08em', textTransform:'uppercase', borderBottom:'1px solid rgba(255,255,255,.5)', paddingBottom:6}}, s))));
}