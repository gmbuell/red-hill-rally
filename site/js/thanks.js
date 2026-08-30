/* Thank-you page: personalize the impact line from the handoff params. */

(() => {
  RH.qs('#thanks-rocket').innerHTML = RH.badgeRocket('rocket-float');

  const p = RH.priorityById(RH.param('p'));
  const amt = Number(RH.param('amt')) || 0;
  const partnerTier = PARTNER_TIERS.find((t) => t.id === RH.param('partner'));
  const line = RH.qs('#impact-line');

  if (partnerTier) {
    line.innerHTML = `Your business is officially a <strong>${partnerTier.name}</strong> — thank you for powering the Rally!`;
  } else if (p && amt) {
    /* An exact tier, or the open-ended top tier ("$500+") for anything
       at or above it. Impacts mix noun and verb phrases ("A week of…",
       "Co-sponsors…"), so they follow a colon rather than a verb. */
    const top = p.tiers[p.tiers.length - 1];
    const tier = p.tiers.find((t) => t.amount === amt)
      || (top && top.plus && amt >= top.amount ? top : null);
    line.innerHTML = tier
      ? `Your <strong>${RH.money(amt)}</strong> gift to <strong>${p.name}</strong>: ${tier.impact}.`
      : `Your <strong>${RH.money(amt)}</strong> is real, visible support for <strong>${p.name}</strong>.`;
  } else {
    line.textContent =
      'Your gift joins hundreds of families powering the Rally.';
  }

  /* Partner arrivals add their logo right here, tied to the paid
     Stripe session (the sid Stripe fills into the success URL). */
  const sid = RH.param('sid') || '';
  const logoPanel = RH.qs('#logo-panel');
  if (partnerTier && /^cs_[A-Za-z0-9_]+$/.test(sid) && logoPanel) {
    logoPanel.hidden = false;
    const status = RH.qs('#logo-status');
    const say = (msg) => { status.textContent = msg; status.hidden = false; };

    /* First page of a PDF -> PNG file, rendered right here with the
       vendored pdf.js — vector logos come out crisp. Anything pdf.js
       can't open just falls back to the held-for-the-PTA path. */
    const pdfToPng = async (file) => {
      const pdfjs = await import('/js/vendor/pdfjs/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = '/js/vendor/pdfjs/pdf.worker.min.mjs';
      const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.max(1, Math.min(1600 / base.width, 1600 / base.height, 8));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('canvas export failed');
      return new File([blob], file.name.replace(/\.pdf$/i, '') + '.png', { type: 'image/png' });
    };
    RH.qs('#logo-upload').addEventListener('click', async () => {
      const file = RH.qs('#logo-file').files[0];
      if (!file) { say('Choose a file first — PNG, JPG, WebP, SVG, or PDF.'); return; }
      const btn = RH.qs('#logo-upload');
      btn.disabled = true;
      let logoFile = file;
      let original = null;
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        say('Converting your PDF…');
        try {
          logoFile = await pdfToPng(file);
          original = file; // the print-quality original rides along
        } catch (err) { /* conversion failed: the PTA converts by hand */ }
      }
      say('Uploading…');
      const fd = new FormData();
      fd.append('logo', logoFile);
      if (original) fd.append('original', original);
      /* The webhook confirming the payment can lag this page by a few
         seconds — retry while the server still answers 404. */
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const res = await fetch(`/api/partner/logo?sid=${encodeURIComponent(sid)}`, { method: 'POST', body: fd });
          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            logoPanel.innerHTML = data.published
              ? '<h2>Logo received — you’re on the wall!</h2><p style="margin:0;">Your logo is live on the <a href="/partners">Business Partners page</a> and the Rally Board.</p>'
              : (data.reason === 'tier'
                ? '<h2>Logo received — thank you!</h2><p style="margin:0;">Rally Friend includes name recognition on the site; logo placement starts at Rally Supporter ($500). We’ve kept your file in case you upgrade — <a href="mailto:fundraising@redhillpta.org">fundraising@redhillpta.org</a>.</p>'
                : '<h2>Logo received — thank you!</h2><p style="margin:0;">PDFs get a quick convert by the PTA, then your logo joins the <a href="/partners">Business Partners page</a>.</p>');
            return;
          }
          if (res.status !== 404) {
            say(data.error || 'That didn’t work — please try again.');
            btn.disabled = false;
            return;
          }
        } catch (err) { /* network hiccup: fall through to retry */ }
        if (attempt < 3) await new Promise((r) => setTimeout(r, 2500));
      }
      say('We couldn’t confirm the payment yet — wait a moment and try again.');
      btn.disabled = false;
    });
  }
})();
