export function Badge({variant='outline', children, style}) {
  const styles = {
    outline:{border:'1.5px solid var(--black)', color:'var(--black)'},
    solid:{background:'var(--black)', color:'var(--white)'},
    accent:{background:'var(--red)', color:'var(--white)'},
  };
  return React.createElement('span', {style:{display:'inline-block', fontFamily:'var(--font-body)', fontSize:13, fontWeight:700, letterSpacing:'.14em', textTransform:'uppercase', padding:'5px 12px', borderRadius:0, ...styles[variant], ...style}}, children);
}