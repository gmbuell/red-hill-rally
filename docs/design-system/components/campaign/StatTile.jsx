export function StatTile({value, unit, label, sublabel, inverse=true, style}) {
  return React.createElement('div', {style:{background:inverse?'var(--black)':'var(--white)', color:inverse?'var(--white)':'var(--black)', border:inverse?'none':'2px solid var(--black)', padding:24, borderRadius:0, ...style}},
    React.createElement('div', {style:{fontFamily:'var(--font-display)', fontSize:64, lineHeight:.9}}, value, unit && React.createElement('span',{style:{color:'var(--red)', fontSize:40}}, unit)),
    React.createElement('div', {style:{fontFamily:'var(--font-body)', fontSize:13, fontWeight:700, letterSpacing:'.14em', textTransform:'uppercase', marginTop:8}}, label),
    sublabel && React.createElement('div', {style:{fontFamily:'var(--font-body)', fontSize:13, fontWeight:700, letterSpacing:'.14em', textTransform:'uppercase', color:'var(--red)', marginTop:2}}, sublabel));
}