/* ==========================================================================
   AbideBot PRICING CONFIG: the one place to edit plans and prices.
   All prices are DRAFTS. Edit the values below; the pricing cards on the
   home page and the plan list in the waitlist form are built from them.
   - hkd: monthly price in HKD (number), 0 for free, null for "Contact us"
   - usd: approximate USD shown next to it (number or null)
   - cta: "waitlist" (scrolls to the form) or "contact" (opens an email)
   ========================================================================== */
window.ABIDEBOT_PRICING = {
  currencyNote: "Monthly prices in Hong Kong dollars, with approximate US dollars. Draft pricing, which may change before launch.",
  contactEmail: "hello@abidebot.com",
  plans: [
    {
      id: "selfhost", name: "Self-host", hkd: 0, usd: 0,
      status: "Planned",
      desc: "Run AbideBot on your own hardware.",
      features: [
        "The same sealed image we host",
        "Native desktop app",
        "Community support"
      ],
      cta: "waitlist", ctaLabel: "Join the waitlist"
    },
    {
      id: "developer", name: "Developer box", hkd: 78, usd: 10,
      desc: "A hosted munuOS machine that sleeps between jobs. For developers and trials.",
      features: [
        "Private hosted munuOS machine, one per customer",
        "Sleeps when idle, wakes for scheduled jobs",
        "Prepaid AI usage (see below)",
        "Community support"
      ],
      cta: "waitlist", ctaLabel: "Join the waitlist"
    },
    {
      id: "team", name: "Team node", hkd: 1560, usd: 199,
      badge: "For ops teams", highlight: true,
      desc: "An always-on node for agents your team depends on.",
      features: [
        "Always on, 4 GiB reserved memory",
        "Response-time guarantees with alerts when one is missed",
        "Audit log export",
        "Slack and PagerDuty output",
        "Email support",
        "99.5% uptime target, shown on a public status page (no service credits yet)"
      ],
      cta: "waitlist", ctaLabel: "Join the waitlist"
    },
    {
      id: "business", name: "Business SLA node", hkd: 7800, usd: 994,
      status: "Coming later",
      desc: "For production agents with contractual commitments.",
      features: [
        "Always on, 16 GiB reserved memory",
        "Mirrored hot spare",
        "Hong Kong data residency",
        "SSO, DPA and invoice billing",
        "P1 response within 4 business hours",
        "Planned 99.9% monthly SLA with service credits"
      ],
      cta: "contact", ctaLabel: "Contact us"
    },
    {
      id: "selfmanaged", name: "Self-managed support", hkd: null, usd: null,
      status: "Annual, quoted",
      desc: "For regulated firms that run AbideBot on their own infrastructure.",
      features: [
        "Annual agreement, quoted per deployment",
        "Support for your self-hosted install"
      ],
      cta: "contact", ctaLabel: "Contact us"
    }
  ]
};
/* ======================= end of pricing config ========================== */

(function(){
  var P=window.ABIDEBOT_PRICING, grid=document.getElementById('plans');
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function money(p){
    if(p.hkd===null)return '<div class="amt amt-q">Contact us</div><div class="per">Quoted annually</div>';
    if(p.hkd===0)return '<div class="amt">Free</div><div class="per">&nbsp;</div>';
    return '<div class="amt">HK$'+p.hkd.toLocaleString('en-US')+'<small>/mo</small></div><div class="per">≈ US$'+p.usd.toLocaleString('en-US')+'/mo</div>';
  }
  if(grid){
    grid.innerHTML=P.plans.map(function(p){
      var href=p.cta==='contact'?'mailto:'+P.contactEmail+'?subject='+encodeURIComponent('AbideBot: '+p.name):'#early-access';
      return '<div class="card price'+(p.highlight?' pop':'')+'"'+(p.badge?' data-badge="'+esc(p.badge)+'"':'')+'>'+
        '<h3>'+esc(p.name)+(p.status?' <span class="tag soon">'+esc(p.status)+'</span>':'')+'</h3>'+money(p)+
        '<p class="desc">'+esc(p.desc)+'</p><ul>'+p.features.map(function(f){return '<li>'+esc(f)+'</li>'}).join('')+'</ul>'+
        '<a class="btn '+(p.highlight?'btn-primary':'btn-ghost')+'" href="'+href+'" data-plan="'+esc(p.name)+'">'+esc(p.ctaLabel)+'</a></div>';
    }).join('');
    var note=document.getElementById('plans-note');if(note)note.textContent=P.currencyNote;
  }
  var sel=document.getElementById('wl-plan');
  if(sel){P.plans.forEach(function(p){var o=document.createElement('option');o.textContent=p.name;sel.appendChild(o)})}
})();
