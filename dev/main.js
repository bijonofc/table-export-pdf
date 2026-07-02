import './styles.css';
import { renderSection } from './ui.js';
import csv from './sections/01-csv.js';
import printPdf from './sections/02-print-pdf.js';
import downloadPdf from './sections/03-download-pdf.js';
import dynamicCols from './sections/04-dynamic-columns.js';
import options from './sections/05-options.js';
import previewApi from './sections/06-preview-api.js';

const sections = [csv, printPdf, downloadPdf, dynamicCols, options, previewApi];

const nav = document.getElementById('nav');
const content = document.getElementById('content');

const links = {};
sections.forEach(s => {
    const a = document.createElement('a');
    a.href = '#' + s.id;
    a.textContent = s.title;
    a.dataset.id = s.id;
    nav.appendChild(a);
    links[s.id] = a;
    content.appendChild(renderSection(s));
});

// Scrollspy: highlight the nav link of the section currently in view.
const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
        if (e.isIntersecting) {
            Object.values(links).forEach(l => l.classList.remove('active'));
            if (links[e.target.id]) links[e.target.id].classList.add('active');
        }
    });
}, { rootMargin: '-40% 0px -55% 0px' });
sections.forEach(s => {
    const el = document.getElementById(s.id);
    if (el) obs.observe(el);
});

// Mobile nav toggle.
const toggle = document.getElementById('nav-toggle');
if (toggle) toggle.addEventListener('click', () => document.body.classList.toggle('nav-open'));
