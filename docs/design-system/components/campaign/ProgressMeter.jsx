export function ProgressMeter({percent=0, label='Participation', attribution, style}) {
  const p = Math.max(0, Math.min(100, percent));
  return React.createElement('div', {style:{display:'flex', gap:28, alignItems:'center', ...style}},
    React.createElement('div', {style:{display:'flex', gap:12, alignItems:'flex-end', height:150}},
      React.createElement('div', {style:{position:'relative', width:34, height:150}},
        React.createElement('div', {style:{position:'absolute', left:9, top:0, width:16, height:16, background:'var(--black)', clipPath:'polygon(50% 0,100% 100%,0 100%)'}}),
        React.createElement('div', {style:{position:'absolute', left:9, top:16, width:16, height:110, background:'var(--black)', overflow:'hidden'}},
          React.createElement('div', {style:{position:'absolute', left:0, bottom:0, width:'100%', height:p+'%', background:'var(--red)', transition:'height .2s linear'}})),
        React.createElement('div', {style:{position:'absolute', left:0, bottom:8, width:12, height:26, background:'var(--black)', clipPath:'polygon(100% 0,100% 100%,0 100%)'}}),
        React.createElement('div', {style:{position:'absolute', right:0, bottom:8, width:12, height:26, background:'var(--black)', clipPath:'polygon(0 0,100% 100%,0 100%)'}})),
      React.createElement('div', {style:{display:'flex', flexDirection:'column', justifyContent:'space-between', height:126, fontFamily:'var(--font-body)', fontSize:13, fontWeight:700, letterSpacing:'.14em'}},
        ['100%','75%','50%','25%'].map((t,i)=>React.createElement('span',{key:i},t)))),
    React.createElement('div', null,
      React.createElement('div', {style:{fontFamily:'var(--font-display)', fontSize:64, lineHeight:.9}}, p, React.createElement('span',{style:{color:'var(--red)', fontSize:40}}, '%')),
      React.createElement('div', {style:{fontFamily:'var(--font-body)', fontSize:13, fontWeight:700, letterSpacing:'.14em', textTransform:'uppercase', marginTop:6}}, label),
      attribution && React.createElement('div', {style:{fontFamily:'var(--font-body)', fontSize:13, fontWeight:700, letterSpacing:'.14em', textTransform:'uppercase', color:'var(--red)', marginTop:2}}, attribution)));
}