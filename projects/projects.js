import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { fetchJSON, renderProjects } from '../global.js';

const projects = await fetchJSON('../lib/projects.json');
const projectsContainer = document.querySelector('.projects');
const projectsTitle = document.querySelector('.projects-title');
const searchInput = document.querySelector('.searchBar');

let query = '';
let selectedYear = null;

let arcGenerator = d3.arc().innerRadius(0).outerRadius(50);
let sliceGenerator = d3.pie().value((d) => d.value);
let colors = d3.scaleOrdinal(d3.schemeTableau10);

function renderPieChart(projectsGiven) {
    let rolledData = d3.rollups(
        projectsGiven,
        (v) => v.length,
        (d) => d.year,
    );

    let data = rolledData.map(([year, count]) => {
        return { value: count, label: year };
    });

    let arcData = sliceGenerator(data);
    let arcs = arcData.map((d) => arcGenerator(d));

    let svg = d3.select('#projects-pie-plot');
    let legend = d3.select('.legend');

    svg.selectAll('path').remove();
    legend.selectAll('li').remove();

    arcs.forEach((arc, idx) => {
        let year = arcData[idx].data.label;

        svg.append('path')
            .attr('d', arc)
            .attr('fill', colors(year))
            .attr('class', selectedYear === year ? 'selected' : '')
            .on('click', () => selectYear(year));
    });

    data.forEach((d) => {
        legend.append('li')
            .attr('class', `legend-item ${selectedYear === d.label ? 'selected' : ''}`)
            .attr('style', `--color:${colors(d.label)}`)
            .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`)
            .on('click', () => selectYear(d.label));
    });
}

function updateProjects() {
    let searchedProjects = projects.filter((project) => {
        let values = Object.values(project).join('\n').toLowerCase();
        return values.includes(query.toLowerCase());
    });

    let filteredProjects = searchedProjects.filter((project) =>
        selectedYear === null || project.year === selectedYear
    );

    renderProjects(filteredProjects, projectsContainer, 'h2');
    projectsTitle.textContent = `${filteredProjects.length} Projects`;
    renderPieChart(searchedProjects);
}

function selectYear(year) {
    selectedYear = selectedYear === year ? null : year;
    updateProjects();
}

searchInput.addEventListener('input', (event) => {
    query = event.target.value;
    updateProjects();
});

updateProjects();
