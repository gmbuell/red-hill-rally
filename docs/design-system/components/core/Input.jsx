export function Input({label, hint, style, ...rest}) {
  return React.createElement('label', {style:{display:'block', fontFamily:'var(--font-body)'}},
    label && React.createElement('span', {style:{display:'block', fontSize:13, fontWeight:700, letterSpacing:'.14em', textTransform:'uppercase', marginBottom:6}}, label),
    React.createElement('input', {...rest, style:{display:'block', width:'100%', boxSizing:'border-box', fontFamily:'var(--font-body)', fontSize:16, fontWeight:500, padding:'12px 14px', border:'2px solid var(--black)', borderRadius:0, background:'var(--white)', outline:'none', ...style},
      onFocus:e=>{e.target.style.borderColor='var(--red)'; rest.onFocus&&rest.onFocus(e)},
      onBlur:e=>{e.target.style.borderColor='var(--black)'; rest.onBlur&&rest.onBlur(e)}}),
    hint && React.createElement('span', {style:{display:'block', fontSize:13, color:'var(--text-muted)', marginTop:5}}, hint));
}