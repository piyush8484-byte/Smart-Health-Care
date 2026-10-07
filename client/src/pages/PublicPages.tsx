import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BellRing, CalendarDays, Check, ChevronDown, Cloud, FileHeart, HeartPulse, LockKeyhole, MonitorSmartphone, ShieldCheck, Sparkles, Stethoscope, UsersRound, Wifi } from 'lucide-react';

const modules = [
  { icon: FileHeart, title: 'One health record', text: 'Reports, prescriptions, allergies and history gathered into a record you can actually find.', tint: 'mint' },
  { icon: CalendarDays, title: 'Appointments, without the back-and-forth', text: 'Find the right clinician, book a time and keep follow-ups in one place.', tint: 'blue' },
  { icon: Activity, title: 'Vitals that keep moving', text: 'Bring readings from connected devices into a live, readable health timeline.', tint: 'coral' },
  { icon: Sparkles, title: 'Explainable health insights', text: 'See what changed, why a reading was flagged and what next step is recommended.', tint: 'gold' },
  { icon: LockKeyhole, title: 'Privacy with clear boundaries', text: 'Role-based access, patient consent and an audit trail for sensitive record activity.', tint: 'violet' },
  { icon: BellRing, title: 'One place for important updates', text: 'Appointment reminders and health alerts reach the people who need to act.', tint: 'mint' }
];

const faqs = [
  ['Is Smart Healthcare a diagnostic tool?', 'No. Risk flags are explainable decision support based on submitted vital readings. They are not a diagnosis or a replacement for advice from a qualified clinician.'],
  ['Who can see my records?', 'Patients can review their own information. Clinicians need an active care relationship or patient sharing consent. Administrative access is role-restricted and recorded.'],
  ['Can I use the platform without a wearable?', 'Yes. Patients can enter readings manually. Connected-device integrations can also submit readings to the health timeline.'],
  ['Where are reports stored?', 'Report files are kept in the private storage configured for the service. Deployment operators should configure encryption, backups, retention and access controls before storing real health information.']
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="eyebrow"><span />{children}</div>;
}

export function HomePage() {
  return <>
    <section className="home-hero">
      <div className="hero-shade" />
      <div className="hero-content">
        <Eyebrow>CONNECTED CARE, BUILT AROUND YOU</Eyebrow>
        <h1>Your health,<br /><em>connected</em> and secure.</h1>
        <p>Medical records, your care team and everyday health signals, finally working together.</p>
        <div className="hero-actions"><Link to="/register" className="button button-light">Create your account <ArrowUpRight size={16} /></Link><Link to="/services" className="text-link light-link">Explore the platform <ArrowRight size={16} /></Link></div>
        <div className="hero-proof"><span className="proof-icon"><ShieldCheck size={17} /></span><span>Private by design</span><i /> <span>Built for patients and care teams</span></div>
      </div>
      <div className="hero-index"><span>01</span><span className="index-line" /><span>CONNECTED CARE</span></div>
      <a className="hero-scroll" href="#platform"><ArrowDownRight size={17} /> Scroll to explore</a>
    </section>

    <section className="ticker" aria-label="Platform capabilities"><div className="ticker-track"><span><FileHeart /> HEALTH RECORDS</span><i /><span><CalendarDays /> APPOINTMENTS</span><i /><span><Activity /> REMOTE MONITORING</span><i /><span><LockKeyhole /> SECURE BY DESIGN</span><i /><span><Sparkles /> EXPLAINABLE INSIGHTS</span><i /><span><FileHeart /> HEALTH RECORDS</span></div></section>

    <section className="section section-intro" id="platform">
      <div className="intro-copy"><Eyebrow>THE CARE GAP</Eyebrow><h2>Your health story<br />shouldn’t live in<br /><span>six different places.</span></h2></div>
      <div className="intro-detail"><p>Scattered records. Missed follow-ups. Numbers that nobody has time to explain. When care information is disconnected, it’s harder for patients to stay informed and for clinicians to see the whole picture.</p><p>Smart Healthcare brings the essential pieces together, so the next step in care feels clearer and more coordinated.</p><Link to="/services" className="text-link">See how it connects <ArrowRight size={16} /></Link></div>
      <div className="intro-stats"><div><strong>01</strong><span>connected patient record</span></div><div><strong>LIVE</strong><span>vital trend monitoring</span></div><div><strong>3</strong><span>role-specific workspaces</span></div><div><strong>0</strong><span>diagnostic claims</span></div></div>
    </section>

    <section className="section modules-section">
      <div className="section-heading"><div><Eyebrow>ONE PLATFORM, SIX CAPABILITIES</Eyebrow><h2>Care works better<br />when the pieces connect.</h2></div><Link to="/services" className="button button-outline">Explore all services <ArrowUpRight size={15} /></Link></div>
      <div className="module-grid">{modules.map(({ icon: Icon, title, text, tint }, index) => <article className="module-card" key={title}><div className={`module-icon ${tint}`}><Icon size={20} /></div><div className="module-meta">0{index + 1} / 06</div><h3>{title}</h3><p>{text}</p><Link to="/services" aria-label={`Learn about ${title}`} className="card-arrow"><ArrowUpRight size={17} /></Link></article>)}</div>
    </section>

    <section className="workflow-band">
      <div className="workflow-title"><Eyebrow>A CALMER WAY THROUGH</Eyebrow><h2>Four steps.<br />A more connected day.</h2><p>From first sign-in to the next care decision, keep the important things close.</p></div>
      <div className="workflow-list">{[
        ['01', 'Bring your story together', 'Add your health profile, past reports and current care needs.'],
        ['02', 'Connect with your care team', 'Find a clinician and book a visit or follow-up.'],
        ['03', 'Keep an eye on what changes', 'Review readings and get alerts when a value needs attention.'],
        ['04', 'Make the next step clearer', 'Understand the signals, share with consent and stay in the loop.']
      ].map(([number, title, description]) => <div className="workflow-step" key={number}><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div><ArrowUpRight size={17} /></div>)}</div>
    </section>

    <section className="section role-section">
      <div className="role-heading"><Eyebrow>BUILT FOR THE WHOLE CARE CIRCLE</Eyebrow><h2>One connected view.<br />A different focus for everyone.</h2></div>
      <div className="role-grid">
        <article className="role-panel role-patient"><div className="role-top"><span className="role-icon"><HeartPulse size={19} /></span><span>FOR PATIENTS</span></div><h3>Your care,<br />easier to follow.</h3><p>See records, appointments, health signals and care-team updates in one calm workspace.</p><Link to="/register" className="text-link">Start as a patient <ArrowRight size={15} /></Link></article>
        <article className="role-panel role-doctor"><div className="role-top"><span className="role-icon"><Stethoscope size={19} /></span><span>FOR CLINICIANS</span></div><h3>The right context<br />before the visit.</h3><p>Review shared patient history, manage today’s schedule and follow changing readings.</p><Link to="/login" className="text-link">Open clinician access <ArrowRight size={15} /></Link></article>
        <article className="role-panel role-admin"><div className="role-top"><span className="role-icon"><UsersRound size={19} /></span><span>FOR ORGANIZATIONS</span></div><h3>Care operations,<br />with visibility.</h3><p>Approve clinicians, monitor platform activity and review access events.</p><Link to="/architecture" className="text-link">See the architecture <ArrowRight size={15} /></Link></article>
      </div>
    </section>

    <section className="security-band">
      <div className="security-mark"><ShieldCheck size={25} /></div><div className="security-copy"><Eyebrow>TRUST IS PART OF THE CARE</Eyebrow><h2>Private records.<br /><span>Clear permission.</span></h2><p>Role-based access, patient sharing consent, encrypted clinical notes and an audit trail help keep sensitive health information in the right hands.</p><Link to="/privacy" className="text-link">Our privacy approach <ArrowRight size={16} /></Link></div>
      <div className="security-list"><div><LockKeyhole /><span><b>Encrypted notes</b><small>Clinical note fields protected at rest</small></span><Check /></div><div><UsersRound /><span><b>Role-aware access</b><small>Patients, clinicians and admins have distinct permissions</small></span><Check /></div><div><FileHeart /><span><b>Access history</b><small>Record access and downloads are logged</small></span><Check /></div><div><Cloud /><span><b>Cloud-ready</b><small>Designed for managed hosting and backups</small></span><Check /></div></div>
    </section>

    <section className="section voices-section">
      <div className="section-heading"><div><Eyebrow>WHAT CONNECTED CARE SHOULD FEEL LIKE</Eyebrow><h2>Less chasing.<br />More understanding.</h2></div><span className="placeholder-note">Illustrative feedback for project presentation</span></div>
      <div className="quote-grid"><blockquote><div className="quote-mark">“</div><p>I can see what happened between visits without calling three different offices.</p><footer><span className="avatar avatar-mint">AP</span><span><b>A. Patient</b><small>Patient experience placeholder</small></span></footer></blockquote><blockquote><div className="quote-mark">“</div><p>Having the timeline and recent readings together helps me prepare for a more focused conversation.</p><footer><span className="avatar avatar-coral">DR</span><span><b>Dr. R.</b><small>Clinician experience placeholder</small></span></footer></blockquote><blockquote><div className="quote-mark">“</div><p>The alerts explain why a value stands out. That makes it easier to know when to follow up.</p><footer><span className="avatar avatar-blue">HC</span><span><b>Care coordinator</b><small>Organization experience placeholder</small></span></footer></blockquote></div>
    </section>

    <FaqSection />
    <section className="final-cta"><div className="cta-orbit"><Activity size={22} /></div><Eyebrow>MAKE ROOM FOR BETTER COORDINATION</Eyebrow><h2>Your health, connected<br />from here.</h2><p>Bring records, people and useful signals into one place.</p><Link to="/register" className="button button-light">Get started <ArrowUpRight size={16} /></Link></section>
  </>;
}

function FaqSection() {
  const [open, setOpen] = useState(0);
  return <section className="section faq-section"><div className="faq-heading"><Eyebrow>GOOD QUESTIONS</Eyebrow><h2>Clarity, before<br />you sign in.</h2><p>Smart Healthcare supports care conversations. Your clinical team remains your source for medical decisions.</p></div><div className="faq-list">{faqs.map(([question, answer], index) => <div className={`faq-item ${open === index ? 'expanded' : ''}`} key={question}><button aria-expanded={open === index} onClick={() => setOpen(open === index ? -1 : index)}><span>{question}</span><ChevronDown size={18} /></button>{open === index && <p>{answer}</p>}</div>)}</div></section>;
}

export function ServicesPage() {
  const details = [
    { icon: FileHeart, title: 'Centralized health records', text: 'A searchable timeline for patient demographics, allergies, chronic conditions, reports and prescriptions. PDF and image uploads are validated and access-checked.', points: ['Patient-owned profile and consent', 'Encrypted clinical notes', 'Searchable, paginated records'] },
    { icon: CalendarDays, title: 'Appointments and consultations', text: 'Find approved doctors by specialty, request a slot, confirm or reschedule visits, and keep follow-up details together.', points: ['Role-aware appointment actions', 'Availability and status tracking', 'Consultation and follow-up fields'] },
    { icon: Activity, title: 'Remote health monitoring', text: 'Bring heart rate, oxygen saturation, blood pressure, temperature and glucose readings into a live-updating timeline.', points: ['Vitals chart with normal ranges', 'Connected device simulator', 'Threshold-based in-app alerts'] },
    { icon: Sparkles, title: 'Explainable analytics', text: 'A transparent rule-based engine names the values that triggered a risk flag and offers sensible next steps.', points: ['Low, medium and high risk levels', 'Reasons shown beside every flag', 'Decision support, not a diagnosis'] },
    { icon: LockKeyhole, title: 'Secure data management', text: 'Protect clinical details with access roles, patient consent, encrypted notes and an administrative audit history.', points: ['Access tokens and role middleware', 'Patient sharing controls', 'Sensitive record events logged'] },
    { icon: BellRing, title: 'Notifications and dashboards', text: 'Keep reminders, health alerts and role-specific tasks visible without losing the context behind them.', points: ['Unread notification count', 'Patient, doctor and admin workspaces', 'Email delivery with SMTP configuration'] }
  ];
  return <PageIntro eyebrow="SERVICES / 01" title={<>Connected tools for<br /><em>connected care.</em></>} copy="Six practical capabilities, designed to solve the everyday friction of disconnected healthcare." ><div className="service-detail-list">{details.map(({ icon: Icon, title, text, points }, index) => <article className="service-row" key={title}><div className="service-number">0{index + 1}</div><div className="service-symbol"><Icon size={23} /></div><div className="service-body"><h2>{title}</h2><p>{text}</p></div><ul>{points.map((point) => <li key={point}><Check size={14} />{point}</li>)}</ul></article>)}</div><div className="service-disclaimer"><ShieldCheck size={20} /><p>Health-risk alerts are informational decision support and are not a diagnosis. Follow your clinician’s care plan.</p></div></PageIntro>;
}

export function AboutPage() {
  const team = ['Aryan Deshmukh', 'Aaryan Chavan', 'Bhagwat Malode', 'Piyush Bhogil'];
  return <PageIntro eyebrow="ABOUT SMARTCARE" title={<>Technology that<br />keeps care <em>connected.</em></>} copy="A connected care platform designed to help patients and clinicians coordinate around one clearer health story.">
    <div className="about-story"><div><Eyebrow>OUR VISION</Eyebrow><h2>From scattered records<br />to a shared picture.</h2></div><div><p>Smart Healthcare Cloud Platform brings electronic health records, appointments, remote monitoring and notifications into a single role-aware experience.</p><p>We are building around a simple principle: technology should make health information easier to understand and safer to share, while leaving diagnosis and treatment decisions with qualified healthcare professionals.</p></div></div>
    <div className="team-heading"><Eyebrow>THE PROJECT TEAM</Eyebrow><h2>Built by team SY2514.</h2></div><div className="team-grid">{team.map((name, index) => <article className="team-card" key={name}><span className={`team-avatar team-${index + 1}`}>{name.split(' ').map((word) => word[0]).join('')}</span><span className="team-index">TEAM MEMBER / 0{index + 1}</span><h3>{name}</h3><p>Smart Healthcare Cloud Platform</p></article>)}</div>
    <div className="faculty-strip"><div><Eyebrow>FACULTY GUIDE</Eyebrow><h3>Prof. Rohidas Sangore</h3><p>MIT School of Computing · MIT-ADT University, Pune</p></div><span>GROUP SY2514</span></div>
  </PageIntro>;
}

export function ArchitecturePage() {
  return <PageIntro eyebrow="ARCHITECTURE / 03" title={<>A clear path from<br /><em>signal to support.</em></>} copy="A layered platform keeps the user experience accessible, the data protected and the analytics explainable.">
    <div className="architecture-canvas">
      <div className="architecture-band users-band"><div className="arch-band-label">CARE PARTICIPANTS</div><div className="arch-nodes"><span><UsersRound /> Patients</span><span><Stethoscope /> Doctors</span><span><MonitorSmartphone /> Hospitals</span></div></div>
      <div className="arch-down"><span>secure HTTPS / responsive access</span><ArrowDownRight /></div>
      <div className="architecture-node web-node"><div className="arch-node-icon"><MonitorSmartphone /></div><div><b>Responsive website</b><small>Public pages · role-based dashboards</small></div><span>REACT + TYPESCRIPT</span></div>
      <div className="arch-down"><span>validated REST requests</span><ArrowDownRight /></div>
      <div className="architecture-node api-node"><div className="arch-node-icon"><Wifi /></div><div><b>Backend & API</b><small>Authentication · clinical workflows · access policy</small></div><span>EXPRESS + JWT + RBAC</span></div>
      <div className="arch-branches"><div className="branch-card"><Cloud /><b>Cloud database / EHR</b><small>Profiles · appointments · records</small></div><div className="branch-card"><Activity /><b>AI / ML analytics</b><small>Explainable rules · risk reasons</small></div><div className="branch-card"><BellRing /><b>Notifications</b><small>In-app · email · SMS provider stub</small></div></div>
      <div className="arch-source-row"><span><MonitorSmartphone /> Wearables & IoT</span><span>→</span><span>device simulator</span><span>→</span><span>Vitals ingestion API</span></div>
      <div className="security-rail"><LockKeyhole /><span><b>SECURITY LAYER</b><small>Encryption · role-based access · consent · audit logs · backup planning</small></span><ShieldCheck /></div>
    </div>
    <div className="architecture-caption"><span>DATA FLOW / 01</span><p>Readings enter through the authenticated ingestion endpoint. The risk engine returns levels, reasons and recommendations; high-priority readings can generate notifications. It is decision support, not a diagnosis.</p></div>
  </PageIntro>;
}

export function ContactPage() {
  return <PageIntro eyebrow="CONTACT / 04" title={<>Let’s make care<br /><em>work together.</em></>} copy="For assistance, reach out to the organization that manages your SmartCare service.">
    <section className="contact-guidance"><h2>Clinical questions</h2><p>For medical advice, appointments or questions about your health records, contact your doctor or care provider directly.</p><h2>Account support</h2><p>For sign-in and account access help, contact the organization that provided your SmartCare account.</p></section>
  </PageIntro>;
}

export function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  const privacy = kind === 'privacy';
  return <PageIntro eyebrow={privacy ? 'PRIVACY POLICY' : 'TERMS OF USE'} title={privacy ? <>Your health information<br /><em>deserves care.</em></> : <>Clear terms for<br /><em>connected care.</em></>} copy="Last updated October 2026 · Data handling depends on your deployment">
    <div className="legal-copy"><h2>{privacy ? 'Information stored by the service' : 'Service scope'}</h2><p>{privacy ? 'The service may store account details, patient profiles, consent preferences, appointments, vital readings and uploaded report files in the database and private file storage configured by the deployment operator. Before storing real health information, confirm that the deployment meets applicable privacy, security and legal requirements.' : 'Smart Healthcare Cloud provides tools for care coordination and health record management. It is not a medical device, healthcare provider, emergency service or source of diagnosis or treatment.'}</p><h2>{privacy ? 'Access and security' : 'No medical advice'}</h2><p>{privacy ? 'The application uses role-based permissions, encrypts selected clinical notes, and records access events. Deployment operators are responsible for unique secrets, TLS, restricted origins, protected storage, tested backups and any required compliance review.' : 'Risk levels and recommendations are explainable decision support only. For a medical concern, consult a qualified clinician. In an emergency, contact local emergency services.'}</p><h2>{privacy ? 'Retention and contact' : 'Your responsibilities'}</h2><p>{privacy ? 'Retention depends on the database and file-storage policies configured by the deployment operator. Contact the service operator through the published support channel with questions about your information.' : 'Protect your account credentials and use the service in accordance with applicable law and the policies of the organization operating your deployment.'}</p></div>
  </PageIntro>;
}

function PageIntro({ eyebrow, title, copy, children }: { eyebrow: string; title: React.ReactNode; copy: string; children: React.ReactNode }) {
  return <div className="inner-page"><section className="page-hero"><Eyebrow>{eyebrow}</Eyebrow><h1>{title}</h1><p>{copy}</p></section><div className="page-content">{children}</div></div>;
}

export function NotFoundPage() {
  return <div className="not-found"><Eyebrow>404 / NOT FOUND</Eyebrow><h1>This page went<br /><em>off the chart.</em></h1><p>The page may have moved. Your care information hasn’t.</p><Link to="/" className="button button-primary">Back to home <ArrowRight size={16} /></Link></div>;
}