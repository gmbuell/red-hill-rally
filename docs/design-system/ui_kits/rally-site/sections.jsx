const DS = window.RocketRallyDesignSystem_5ed1f4;
const { Button, Badge, Input, Card, CountdownTile, ProgressMeter, StatTile, SponsorBoard } = DS;
const label = {fontFamily:'var(--font-body)', fontSize:13, fontWeight:700, letterSpacing:'.14em', textTransform:'uppercase'};
const display = {fontFamily:'var(--font-display)', textTransform:'uppercase', lineHeight:.9};

function Crosshair({color='#000'}) {
  return <svg width="40" height="40" viewBox="0 0 36 36" fill="none" stroke={color} strokeWidth="1.5"><circle cx="18" cy="18" r="10"/><line x1="18" y1="0" x2="18" y2="8"/><line x1="18" y1="28" x2="18" y2="36"/><line x1="0" y1="18" x2="8" y2="18"/><line x1="28" y1="18" x2="36" y2="18"/></svg>;
}
function TopBar({onDonate}) {
  return <header style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 32px', background:'var(--black)', color:'#fff'}}>
    <div style={{...display, fontSize:22}}>Red Hill <span style={{color:'var(--red)'}}>Elementary</span></div>
    <nav style={{display:'flex', gap:24, alignItems:'center'}}>
      <span style={{...label, color:'rgba(255,255,255,.85)'}}>The Rally</span>
      <span style={{...label, color:'rgba(255,255,255,.85)'}}>Sponsors</span>
      <Badge variant="accent">#RocketRally2026</Badge>
      <Button variant="accent" size="sm" onClick={onDonate}>Donate.</Button>
    </nav>
  </header>;
}
function Hero({onDonate}) {
  return <section style={{background:'var(--paper)', padding:'56px 32px 48px', position:'relative'}}>
    <div style={{position:'absolute', top:20, right:24}}><Crosshair/></div>
    <div style={{...label, color:'var(--red)', marginBottom:12}}>Rocket Rally 2026</div>
    <h1 style={{...display, fontSize:130, margin:0}}>Hey Red<br/>Hill<span style={{color:'var(--red)'}}>.</span></h1>
    <div style={{...display, fontSize:34, marginTop:14}}>It's time to <span style={{color:'var(--red)'}}>rally.</span></div>
    <div style={{display:'flex', gap:28, marginTop:28, alignItems:'center'}}>
      <Button variant="primary" size="lg" onClick={onDonate}>Join the mission.</Button>
      <div style={label}>One campaign. One ask. One celebration.</div>
    </div>
    <div style={{display:'flex', gap:40, marginTop:36, borderTop:'2px solid var(--black)', paddingTop:16}}>
      {[['09.08','Launch','Campaign opens'],['10.06','Mission close','5:00 PM deadline'],['10.07','Liftoff','Rocket Rally']].map(([d,t,s])=>
        <div key={d}><div style={{...label, color:'var(--red)'}}>{d}</div><div style={{...display, fontSize:26}}>{t}</div><div style={{...label, color:'var(--text-muted)'}}>{s}</div></div>)}
    </div>
  </section>;
}
function MissionRow({percent}) {
  return <section style={{display:'grid', gridTemplateColumns:'auto 1fr auto', gap:16, padding:'24px 32px', background:'var(--white)', borderTop:'2px solid var(--black)', borderBottom:'2px solid var(--black)', alignItems:'stretch'}}>
    <CountdownTile days={5} />
    <div style={{border:'2px solid var(--black)', padding:24, display:'flex', flexDirection:'column', justifyContent:'center', gap:8}}>
      <div style={{...display, fontSize:40}}>Your mission: <span style={{color:'var(--red)'}}>$100</span></div>
      <div style={{...display, fontSize:24}}>4 people. $25 each.</div>
      <div style={{...label, color:'var(--text-muted)'}}>Every student. Every class. That's the rally.</div>
    </div>
    <div style={{border:'2px solid var(--black)', padding:'20px 28px', display:'flex', alignItems:'center'}}>
      <ProgressMeter percent={percent} label="Participation" attribution="Rally status" />
    </div>
  </section>;
}
function Priorities() {
  const items = ['Student Support Staff','STEM Lab','Sports at Lunch Recess','School Garden','Arts & Cultural Enrichment','Campus Safety & Upgrades'];
  return <section style={{padding:'40px 32px', background:'var(--paper)'}}>
    <div style={{...label, color:'var(--red)'}}>Our six funding priorities</div>
    <div style={{...display, fontSize:44, margin:'8px 0 24px'}}>Where the money <span style={{color:'var(--red)'}}>goes.</span></div>
    <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12}}>
      {items.map((t,i)=><div key={t} style={{border:'2px solid var(--black)', padding:'18px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--white)'}}>
        <span style={{...display, fontSize:22}}>{t}</span><span style={{...label, color:'var(--red)'}}>0{i+1}</span></div>)}
    </div>
  </section>;
}
function SponsorsAndPhoto() {
  return <section style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:0}}>
    <SponsorBoard style={{padding:'40px 32px'}} sponsors={["AOQ","EarthCo","O'Dell Group","Felton","Davidson & Associates","Winco Foods","Patrick Plumbing","Morrison Tire Inc."]} />
    <div style={{background:'#111', color:'rgba(255,255,255,.8)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10, minHeight:260}}>
      <Crosshair color="rgba(255,255,255,.5)"/>
      <div style={label}>Photo slot — B&W event day imagery</div>
    </div>
  </section>;
}
function Footer() {
  return <footer style={{background:'var(--black)', color:'#fff', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 32px'}}>
    <span style={label}>One school. One community. <span style={{color:'var(--red)'}}>One rally.</span></span>
    <span style={{...display, fontSize:18}}>Let's launch something amazing.</span>
    <span style={{...label, color:'var(--red)'}}>#RocketRally2026</span>
  </footer>;
}
function DonateOverlay({open, onClose, onPledge}) {
  const [name, setName] = React.useState('');
  const [amount, setAmount] = React.useState('25');
  const [done, setDone] = React.useState(false);
  if (!open) return null;
  return <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10}}>
    <div style={{background:'var(--white)', border:'2px solid var(--black)', padding:36, width:420}}>
      {done ? <div>
        <div style={{...display, fontSize:44}}>We have <span style={{color:'var(--red)'}}>liftoff.</span></div>
        <p style={{fontFamily:'var(--font-body)', fontSize:16, fontWeight:600}}>Thank you{name?', '+name:''}. Your ${amount} pledge is counted toward the mission.</p>
        <Button variant="primary" onClick={()=>{setDone(false); onClose();}}>Back to mission control.</Button>
      </div> : <div style={{display:'grid', gap:16}}>
        <div style={{...display, fontSize:36}}>Join the <span style={{color:'var(--red)'}}>mission.</span></div>
        <Input label="Your name" placeholder="Full name" value={name} onChange={e=>setName(e.target.value)} />
        <Input label="Pledge amount" type="number" value={amount} onChange={e=>setAmount(e.target.value)} hint="The ask: $25 per person" />
        <div style={{display:'flex', gap:12}}>
          <Button variant="accent" onClick={()=>{setDone(true); onPledge();}}>Pledge.</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>}
    </div>
  </div>;
}
function RallySite() {
  const [open, setOpen] = React.useState(false);
  const [percent, setPercent] = React.useState(82);
  return <div style={{background:'var(--paper)', minHeight:'100vh'}}>
    <TopBar onDonate={()=>setOpen(true)} />
    <Hero onDonate={()=>setOpen(true)} />
    <MissionRow percent={percent} />
    <Priorities />
    <SponsorsAndPhoto />
    <Footer />
    <DonateOverlay open={open} onClose={()=>setOpen(false)} onPledge={()=>setPercent(p=>Math.min(100,p+1))} />
  </div>;
}
Object.assign(window, { RallySite });