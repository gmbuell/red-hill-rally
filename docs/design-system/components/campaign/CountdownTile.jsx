export function CountdownTile({days=5, label='Countdown to liftoff', style}) {
  return React.createElement('div', {style:{background:'var(--black)', color:'var(--white)', padding:'28px 32px', borderRadius:0, ...style}},
    React.createElement('div', {style:{fontFamily:'var(--font-body)', fontSize:13, fontWeight:700, letterSpacing:'.14em', textTransform:'uppercase', marginBottom:10, display:'flex', alignItems:'center', gap:10}},
      React.createElement('span',{style:{fontSize:16,lineHeight:1,fontWeight:400}},'+'), label, React.createElement('span',{style:{fontSize:16,lineHeight:1,fontWeight:400}},'+')),
    React.createElement('div', {style:{fontFamily:'var(--font-display)', fontSize:88, lineHeight:.9}}, 'T-', React.createElement('span',{style:{color:'var(--red)'}}, String(days).padStart(2,'0'))),
    React.createElement('div', {style:{fontFamily:'var(--font-display)', fontSize:30, letterSpacing:'.1em'}}, 'DAYS'));
}