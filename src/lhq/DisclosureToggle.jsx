import './disclosureToggle.css';

export function DisclosureToggle({label,context,description=label,open,onToggle,controls,accessibleLabel}) {
 return <button type="button" className="lhq-collapse-strip lhq-disclosure" aria-label={accessibleLabel} aria-expanded={open} aria-controls={controls} title={`${open?'Collapse':'Expand'} ${description}`} onClick={onToggle}>
  <span className="lhq-disclosure-icon" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none"><path d="m8 5 5 5-5 5"/></svg></span>
  <span className="lhq-disclosure-label">{label}</span>
  {context&&<span className="lhq-disclosure-context">{context}</span>}
 </button>;
}
