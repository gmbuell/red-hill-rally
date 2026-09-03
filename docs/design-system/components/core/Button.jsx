export function Button({variant='primary', size='md', disabled, children, style, ...rest}) {
  const pad = size==='sm' ? '8px 16px' : size==='lg' ? '16px 32px' : '12px 24px';
  const fs = size==='sm' ? 16 : size==='lg' ? 24 : 20;
  const base = {fontFamily:'var(--font-display)', textTransform:'uppercase', letterSpacing:'.04em', fontSize:fs, lineHeight:1, padding:pad, border:'2px solid var(--black)', borderRadius:0, cursor:disabled?'not-allowed':'pointer', opacity:disabled?.4:1, background:'var(--white)', color:'var(--black)', transition:'background .15s,color .15s'};
  const variants = {
    primary:{background:'var(--black)', color:'var(--white)'},
    accent:{background:'var(--red)', color:'var(--white)', borderColor:'var(--red)'},
    secondary:{},
    ghost:{border:'2px solid transparent', background:'transparent', textDecoration:'underline', textUnderlineOffset:4},
  };
  const hover = {primary:{background:'var(--white)',color:'var(--black)'}, accent:{background:'var(--red-press)',borderColor:'var(--red-press)'}, secondary:{background:'var(--black)',color:'var(--white)'}, ghost:{color:'var(--red)'}};
  const [h,setH] = React.useState(false);
  return React.createElement('button', {...rest, disabled, onMouseEnter:()=>setH(true), onMouseLeave:()=>setH(false), style:{...base, ...variants[variant], ...(h&&!disabled?hover[variant]:{}), ...style}}, children);
}