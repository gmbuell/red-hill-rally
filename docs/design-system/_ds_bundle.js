/* @ds-bundle: {"format":4,"namespace":"RocketRallyDesignSystem_5ed1f4","components":[{"name":"CountdownTile","sourcePath":"components/campaign/CountdownTile.jsx"},{"name":"ProgressMeter","sourcePath":"components/campaign/ProgressMeter.jsx"},{"name":"SponsorBoard","sourcePath":"components/campaign/SponsorBoard.jsx"},{"name":"StatTile","sourcePath":"components/campaign/StatTile.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"}],"sourceHashes":{"components/campaign/CountdownTile.jsx":"db9048ff2b2e","components/campaign/ProgressMeter.jsx":"de9f70361866","components/campaign/SponsorBoard.jsx":"7d21e4084ea0","components/campaign/StatTile.jsx":"c759769b3562","components/core/Badge.jsx":"22fc7053c5bd","components/core/Button.jsx":"73fd2813f541","components/core/Card.jsx":"cf3e1fbbeac1","components/core/Input.jsx":"fdb78fba44ff","ui_kits/rally-site/sections.jsx":"43b45567f6f6"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.RocketRallyDesignSystem_5ed1f4 = window.RocketRallyDesignSystem_5ed1f4 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/campaign/CountdownTile.jsx
try { (() => {
function CountdownTile({
  days = 5,
  label = 'Countdown to liftoff',
  style
}) {
  return React.createElement('div', {
    style: {
      background: 'var(--black)',
      color: 'var(--white)',
      padding: '28px 32px',
      borderRadius: 0,
      ...style
    }
  }, React.createElement('div', {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 13,
      fontWeight: 700,
      letterSpacing: '.14em',
      textTransform: 'uppercase',
      marginBottom: 10,
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, React.createElement('span', {
    style: {
      fontSize: 16,
      lineHeight: 1,
      fontWeight: 400
    }
  }, '+'), label, React.createElement('span', {
    style: {
      fontSize: 16,
      lineHeight: 1,
      fontWeight: 400
    }
  }, '+')), React.createElement('div', {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 88,
      lineHeight: .9
    }
  }, 'T-', React.createElement('span', {
    style: {
      color: 'var(--red)'
    }
  }, String(days).padStart(2, '0'))), React.createElement('div', {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 30,
      letterSpacing: '.1em'
    }
  }, 'DAYS'));
}
Object.assign(__ds_scope, { CountdownTile });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/campaign/CountdownTile.jsx", error: String((e && e.message) || e) }); }

// components/campaign/ProgressMeter.jsx
try { (() => {
function ProgressMeter({
  percent = 0,
  label = 'Participation',
  attribution,
  style
}) {
  const p = Math.max(0, Math.min(100, percent));
  return React.createElement('div', {
    style: {
      display: 'flex',
      gap: 28,
      alignItems: 'center',
      ...style
    }
  }, React.createElement('div', {
    style: {
      display: 'flex',
      gap: 12,
      alignItems: 'flex-end',
      height: 150
    }
  }, React.createElement('div', {
    style: {
      position: 'relative',
      width: 34,
      height: 150
    }
  }, React.createElement('div', {
    style: {
      position: 'absolute',
      left: 9,
      top: 0,
      width: 16,
      height: 16,
      background: 'var(--black)',
      clipPath: 'polygon(50% 0,100% 100%,0 100%)'
    }
  }), React.createElement('div', {
    style: {
      position: 'absolute',
      left: 9,
      top: 16,
      width: 16,
      height: 110,
      background: 'var(--black)',
      overflow: 'hidden'
    }
  }, React.createElement('div', {
    style: {
      position: 'absolute',
      left: 0,
      bottom: 0,
      width: '100%',
      height: p + '%',
      background: 'var(--red)',
      transition: 'height .2s linear'
    }
  })), React.createElement('div', {
    style: {
      position: 'absolute',
      left: 0,
      bottom: 8,
      width: 12,
      height: 26,
      background: 'var(--black)',
      clipPath: 'polygon(100% 0,100% 100%,0 100%)'
    }
  }), React.createElement('div', {
    style: {
      position: 'absolute',
      right: 0,
      bottom: 8,
      width: 12,
      height: 26,
      background: 'var(--black)',
      clipPath: 'polygon(0 0,100% 100%,0 100%)'
    }
  })), React.createElement('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      height: 126,
      fontFamily: 'var(--font-body)',
      fontSize: 13,
      fontWeight: 700,
      letterSpacing: '.14em'
    }
  }, ['100%', '75%', '50%', '25%'].map((t, i) => React.createElement('span', {
    key: i
  }, t)))), React.createElement('div', null, React.createElement('div', {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 64,
      lineHeight: .9
    }
  }, p, React.createElement('span', {
    style: {
      color: 'var(--red)',
      fontSize: 40
    }
  }, '%')), React.createElement('div', {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 13,
      fontWeight: 700,
      letterSpacing: '.14em',
      textTransform: 'uppercase',
      marginTop: 6
    }
  }, label), attribution && React.createElement('div', {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 13,
      fontWeight: 700,
      letterSpacing: '.14em',
      textTransform: 'uppercase',
      color: 'var(--red)',
      marginTop: 2
    }
  }, attribution)));
}
Object.assign(__ds_scope, { ProgressMeter });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/campaign/ProgressMeter.jsx", error: String((e && e.message) || e) }); }

// components/campaign/SponsorBoard.jsx
try { (() => {
function SponsorBoard({
  title = 'Thank you to our sponsors.',
  sponsors = [],
  style
}) {
  return React.createElement('div', {
    style: {
      background: 'var(--black)',
      color: 'var(--white)',
      padding: 28,
      borderRadius: 0,
      ...style
    }
  }, React.createElement('div', {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 30,
      lineHeight: .95,
      textTransform: 'uppercase',
      maxWidth: 220,
      marginBottom: 20
    }
  }, title), React.createElement('div', {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '14px 24px'
    }
  }, sponsors.map((s, i) => React.createElement('div', {
    key: i,
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 14,
      fontWeight: 800,
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      borderBottom: '1px solid rgba(255,255,255,.5)',
      paddingBottom: 6
    }
  }, s))));
}
Object.assign(__ds_scope, { SponsorBoard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/campaign/SponsorBoard.jsx", error: String((e && e.message) || e) }); }

// components/campaign/StatTile.jsx
try { (() => {
function StatTile({
  value,
  unit,
  label,
  sublabel,
  inverse = true,
  style
}) {
  return React.createElement('div', {
    style: {
      background: inverse ? 'var(--black)' : 'var(--white)',
      color: inverse ? 'var(--white)' : 'var(--black)',
      border: inverse ? 'none' : '2px solid var(--black)',
      padding: 24,
      borderRadius: 0,
      ...style
    }
  }, React.createElement('div', {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 64,
      lineHeight: .9
    }
  }, value, unit && React.createElement('span', {
    style: {
      color: 'var(--red)',
      fontSize: 40
    }
  }, unit)), React.createElement('div', {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 13,
      fontWeight: 700,
      letterSpacing: '.14em',
      textTransform: 'uppercase',
      marginTop: 8
    }
  }, label), sublabel && React.createElement('div', {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 13,
      fontWeight: 700,
      letterSpacing: '.14em',
      textTransform: 'uppercase',
      color: 'var(--red)',
      marginTop: 2
    }
  }, sublabel));
}
Object.assign(__ds_scope, { StatTile });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/campaign/StatTile.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function Badge({
  variant = 'outline',
  children,
  style
}) {
  const styles = {
    outline: {
      border: '1.5px solid var(--black)',
      color: 'var(--black)'
    },
    solid: {
      background: 'var(--black)',
      color: 'var(--white)'
    },
    accent: {
      background: 'var(--red)',
      color: 'var(--white)'
    }
  };
  return React.createElement('span', {
    style: {
      display: 'inline-block',
      fontFamily: 'var(--font-body)',
      fontSize: 13,
      fontWeight: 700,
      letterSpacing: '.14em',
      textTransform: 'uppercase',
      padding: '5px 12px',
      borderRadius: 0,
      ...styles[variant],
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function Button({
  variant = 'primary',
  size = 'md',
  disabled,
  children,
  style,
  ...rest
}) {
  const pad = size === 'sm' ? '8px 16px' : size === 'lg' ? '16px 32px' : '12px 24px';
  const fs = size === 'sm' ? 16 : size === 'lg' ? 24 : 20;
  const base = {
    fontFamily: 'var(--font-display)',
    textTransform: 'uppercase',
    letterSpacing: '.04em',
    fontSize: fs,
    lineHeight: 1,
    padding: pad,
    border: '2px solid var(--black)',
    borderRadius: 0,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? .4 : 1,
    background: 'var(--white)',
    color: 'var(--black)',
    transition: 'background .15s,color .15s'
  };
  const variants = {
    primary: {
      background: 'var(--black)',
      color: 'var(--white)'
    },
    accent: {
      background: 'var(--red)',
      color: 'var(--white)',
      borderColor: 'var(--red)'
    },
    secondary: {},
    ghost: {
      border: '2px solid transparent',
      background: 'transparent',
      textDecoration: 'underline',
      textUnderlineOffset: 4
    }
  };
  const hover = {
    primary: {
      background: 'var(--white)',
      color: 'var(--black)'
    },
    accent: {
      background: 'var(--red-press)',
      borderColor: 'var(--red-press)'
    },
    secondary: {
      background: 'var(--black)',
      color: 'var(--white)'
    },
    ghost: {
      color: 'var(--red)'
    }
  };
  const [h, setH] = React.useState(false);
  return React.createElement('button', {
    ...rest,
    disabled,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      ...base,
      ...variants[variant],
      ...(h && !disabled ? hover[variant] : {}),
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function Card({
  inverse,
  headline,
  accentWord,
  meta,
  children,
  style
}) {
  return React.createElement('div', {
    style: {
      background: inverse ? 'var(--black)' : 'var(--white)',
      color: inverse ? 'var(--white)' : 'var(--black)',
      border: inverse ? 'none' : '2px solid var(--black)',
      borderRadius: 0,
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: 16,
      ...style
    }
  }, React.createElement('div', {
    style: {
      fontFamily: 'var(--font-display)',
      textTransform: 'uppercase',
      fontSize: 30,
      lineHeight: .95
    }
  }, headline, accentWord && [' ', React.createElement('span', {
    key: 'a',
    style: {
      color: 'var(--red)'
    }
  }, accentWord)]), children, meta && React.createElement('div', {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 13,
      fontWeight: 700,
      letterSpacing: '.14em',
      textTransform: 'uppercase',
      color: inverse ? 'rgba(255,255,255,.78)' : 'rgba(0,0,0,.72)'
    }
  }, meta));
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function Input({
  label,
  hint,
  style,
  ...rest
}) {
  return React.createElement('label', {
    style: {
      display: 'block',
      fontFamily: 'var(--font-body)'
    }
  }, label && React.createElement('span', {
    style: {
      display: 'block',
      fontSize: 13,
      fontWeight: 700,
      letterSpacing: '.14em',
      textTransform: 'uppercase',
      marginBottom: 6
    }
  }, label), React.createElement('input', {
    ...rest,
    style: {
      display: 'block',
      width: '100%',
      boxSizing: 'border-box',
      fontFamily: 'var(--font-body)',
      fontSize: 16,
      fontWeight: 500,
      padding: '12px 14px',
      border: '2px solid var(--black)',
      borderRadius: 0,
      background: 'var(--white)',
      outline: 'none',
      ...style
    },
    onFocus: e => {
      e.target.style.borderColor = 'var(--red)';
      rest.onFocus && rest.onFocus(e);
    },
    onBlur: e => {
      e.target.style.borderColor = 'var(--black)';
      rest.onBlur && rest.onBlur(e);
    }
  }), hint && React.createElement('span', {
    style: {
      display: 'block',
      fontSize: 13,
      color: 'var(--text-muted)',
      marginTop: 5
    }
  }, hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// ui_kits/rally-site/sections.jsx
try { (() => {
const DS = window.RocketRallyDesignSystem_5ed1f4;
const {
  Button,
  Badge,
  Input,
  Card,
  CountdownTile,
  ProgressMeter,
  StatTile,
  SponsorBoard
} = DS;
const label = {
  fontFamily: 'var(--font-body)',
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '.14em',
  textTransform: 'uppercase'
};
const display = {
  fontFamily: 'var(--font-display)',
  textTransform: 'uppercase',
  lineHeight: .9
};
function Crosshair({
  color = '#000'
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: "40",
    height: "40",
    viewBox: "0 0 36 36",
    fill: "none",
    stroke: color,
    strokeWidth: "1.5"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "18",
    cy: "18",
    r: "10"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "18",
    y1: "0",
    x2: "18",
    y2: "8"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "18",
    y1: "28",
    x2: "18",
    y2: "36"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "0",
    y1: "18",
    x2: "8",
    y2: "18"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "28",
    y1: "18",
    x2: "36",
    y2: "18"
  }));
}
function TopBar({
  onDonate
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 32px',
      background: 'var(--black)',
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...display,
      fontSize: 22
    }
  }, "Red Hill ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--red)'
    }
  }, "Elementary")), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      gap: 24,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      ...label,
      color: 'rgba(255,255,255,.85)'
    }
  }, "The Rally"), /*#__PURE__*/React.createElement("span", {
    style: {
      ...label,
      color: 'rgba(255,255,255,.85)'
    }
  }, "Sponsors"), /*#__PURE__*/React.createElement(Badge, {
    variant: "accent"
  }, "#RocketRally2026"), /*#__PURE__*/React.createElement(Button, {
    variant: "accent",
    size: "sm",
    onClick: onDonate
  }, "Donate.")));
}
function Hero({
  onDonate
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: 'var(--paper)',
      padding: '56px 32px 48px',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 20,
      right: 24
    }
  }, /*#__PURE__*/React.createElement(Crosshair, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      ...label,
      color: 'var(--red)',
      marginBottom: 12
    }
  }, "Rocket Rally 2026"), /*#__PURE__*/React.createElement("h1", {
    style: {
      ...display,
      fontSize: 130,
      margin: 0
    }
  }, "Hey Red", /*#__PURE__*/React.createElement("br", null), "Hill", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--red)'
    }
  }, ".")), /*#__PURE__*/React.createElement("div", {
    style: {
      ...display,
      fontSize: 34,
      marginTop: 14
    }
  }, "It's time to ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--red)'
    }
  }, "rally.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 28,
      marginTop: 28,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    onClick: onDonate
  }, "Join the mission."), /*#__PURE__*/React.createElement("div", {
    style: label
  }, "One campaign. One ask. One celebration.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 40,
      marginTop: 36,
      borderTop: '2px solid var(--black)',
      paddingTop: 16
    }
  }, [['09.08', 'Launch', 'Campaign opens'], ['10.06', 'Mission close', '5:00 PM deadline'], ['10.07', 'Liftoff', 'Rocket Rally']].map(([d, t, s]) => /*#__PURE__*/React.createElement("div", {
    key: d
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...label,
      color: 'var(--red)'
    }
  }, d), /*#__PURE__*/React.createElement("div", {
    style: {
      ...display,
      fontSize: 26
    }
  }, t), /*#__PURE__*/React.createElement("div", {
    style: {
      ...label,
      color: 'var(--text-muted)'
    }
  }, s)))));
}
function MissionRow({
  percent
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto',
      gap: 16,
      padding: '24px 32px',
      background: 'var(--white)',
      borderTop: '2px solid var(--black)',
      borderBottom: '2px solid var(--black)',
      alignItems: 'stretch'
    }
  }, /*#__PURE__*/React.createElement(CountdownTile, {
    days: 5
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      border: '2px solid var(--black)',
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...display,
      fontSize: 40
    }
  }, "Your mission: ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--red)'
    }
  }, "$100")), /*#__PURE__*/React.createElement("div", {
    style: {
      ...display,
      fontSize: 24
    }
  }, "4 people. $25 each."), /*#__PURE__*/React.createElement("div", {
    style: {
      ...label,
      color: 'var(--text-muted)'
    }
  }, "Every student. Every class. That's the rally.")), /*#__PURE__*/React.createElement("div", {
    style: {
      border: '2px solid var(--black)',
      padding: '20px 28px',
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(ProgressMeter, {
    percent: percent,
    label: "Participation",
    attribution: "Rally status"
  })));
}
function Priorities() {
  const items = ['Student Support Staff', 'STEM Lab', 'Sports at Lunch Recess', 'School Garden', 'Arts & Cultural Enrichment', 'Campus Safety & Upgrades'];
  return /*#__PURE__*/React.createElement("section", {
    style: {
      padding: '40px 32px',
      background: 'var(--paper)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...label,
      color: 'var(--red)'
    }
  }, "Our six funding priorities"), /*#__PURE__*/React.createElement("div", {
    style: {
      ...display,
      fontSize: 44,
      margin: '8px 0 24px'
    }
  }, "Where the money ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--red)'
    }
  }, "goes.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: 12
    }
  }, items.map((t, i) => /*#__PURE__*/React.createElement("div", {
    key: t,
    style: {
      border: '2px solid var(--black)',
      padding: '18px 20px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      background: 'var(--white)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      ...display,
      fontSize: 22
    }
  }, t), /*#__PURE__*/React.createElement("span", {
    style: {
      ...label,
      color: 'var(--red)'
    }
  }, "0", i + 1)))));
}
function SponsorsAndPhoto() {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 0
    }
  }, /*#__PURE__*/React.createElement(SponsorBoard, {
    style: {
      padding: '40px 32px'
    },
    sponsors: ["AOQ", "EarthCo", "O'Dell Group", "Felton", "Davidson & Associates", "Winco Foods", "Patrick Plumbing", "Morrison Tire Inc."]
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#111',
      color: 'rgba(255,255,255,.8)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      minHeight: 260
    }
  }, /*#__PURE__*/React.createElement(Crosshair, {
    color: "rgba(255,255,255,.5)"
  }), /*#__PURE__*/React.createElement("div", {
    style: label
  }, "Photo slot \u2014 B&W event day imagery")));
}
function Footer() {
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: 'var(--black)',
      color: '#fff',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '16px 32px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: label
  }, "One school. One community. ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--red)'
    }
  }, "One rally.")), /*#__PURE__*/React.createElement("span", {
    style: {
      ...display,
      fontSize: 18
    }
  }, "Let's launch something amazing."), /*#__PURE__*/React.createElement("span", {
    style: {
      ...label,
      color: 'var(--red)'
    }
  }, "#RocketRally2026"));
}
function DonateOverlay({
  open,
  onClose,
  onPledge
}) {
  const [name, setName] = React.useState('');
  const [amount, setAmount] = React.useState('25');
  const [done, setDone] = React.useState(false);
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--white)',
      border: '2px solid var(--black)',
      padding: 36,
      width: 420
    }
  }, done ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      ...display,
      fontSize: 44
    }
  }, "We have ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--red)'
    }
  }, "liftoff.")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 16,
      fontWeight: 600
    }
  }, "Thank you", name ? ', ' + name : '', ". Your $", amount, " pledge is counted toward the mission."), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    onClick: () => {
      setDone(false);
      onClose();
    }
  }, "Back to mission control.")) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...display,
      fontSize: 36
    }
  }, "Join the ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--red)'
    }
  }, "mission.")), /*#__PURE__*/React.createElement(Input, {
    label: "Your name",
    placeholder: "Full name",
    value: name,
    onChange: e => setName(e.target.value)
  }), /*#__PURE__*/React.createElement(Input, {
    label: "Pledge amount",
    type: "number",
    value: amount,
    onChange: e => setAmount(e.target.value),
    hint: "The ask: $25 per person"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "accent",
    onClick: () => {
      setDone(true);
      onPledge();
    }
  }, "Pledge."), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    onClick: onClose
  }, "Cancel")))));
}
function RallySite() {
  const [open, setOpen] = React.useState(false);
  const [percent, setPercent] = React.useState(82);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--paper)',
      minHeight: '100vh'
    }
  }, /*#__PURE__*/React.createElement(TopBar, {
    onDonate: () => setOpen(true)
  }), /*#__PURE__*/React.createElement(Hero, {
    onDonate: () => setOpen(true)
  }), /*#__PURE__*/React.createElement(MissionRow, {
    percent: percent
  }), /*#__PURE__*/React.createElement(Priorities, null), /*#__PURE__*/React.createElement(SponsorsAndPhoto, null), /*#__PURE__*/React.createElement(Footer, null), /*#__PURE__*/React.createElement(DonateOverlay, {
    open: open,
    onClose: () => setOpen(false),
    onPledge: () => setPercent(p => Math.min(100, p + 1))
  }));
}
Object.assign(window, {
  RallySite
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/rally-site/sections.jsx", error: String((e && e.message) || e) }); }

__ds_ns.CountdownTile = __ds_scope.CountdownTile;

__ds_ns.ProgressMeter = __ds_scope.ProgressMeter;

__ds_ns.SponsorBoard = __ds_scope.SponsorBoard;

__ds_ns.StatTile = __ds_scope.StatTile;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Input = __ds_scope.Input;

})();
