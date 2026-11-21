
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

// Change to your actual GitHub repository
const repo = 'nghi-nguyen23/portfolio';

// Load and convert CSV data
async function loadData() {
  return await d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + 'T00:00' + row.timezone),
    datetime: new Date(row.datetime),
  }));
}

// Group lines by commit
function processCommits(data) {
  return d3.groups(data, d => d.commit)
    .map(([commit, lines]) => {
      const first = lines[0];

      const { author, date, time, timezone, datetime } = first;

      const ret = {
        id: commit,
        author,
        date,
        time,
        timezone,
        datetime,
        hourFrac: datetime.getHours() +
                  datetime.getMinutes() / 60,
        totalLines: lines.length,
        url: `https://github.com/${repo}/commit/${commit}`,
      };

      Object.defineProperty(ret, 'lines', {
        value: lines,
        enumerable: false,
      });

      return ret;
    })
    .sort((a, b) => a.datetime - b.datetime);
}

// Variables for Lab 8
let data;
let commits;
let filteredCommits;

let commitProgress = 100;
let timeScale;
let commitMaxTime;

let xScale;
let yScale;
let rScale;
let brushGroup;
let brush;
let activeSelection = null;

let colors = d3.scaleOrdinal(d3.schemeTableau10);

// Summary statistics
function renderCommitInfo(data, commits) {
  const container = d3.select('#stats');
  container.selectAll('*').remove();

  const dl = container.append('dl')
    .attr('class', 'stats');

  const fileLengths = d3.rollups(
    data,
    v => d3.max(v, d => d.line),
    d => d.file
  );

  const stats = [
    ['Total LOC', data.length],
    ['Total commits', commits.length],
    ['Total files', d3.group(data, d => d.file).size],
    ['Average line length',
      d3.mean(data, d => d.length)?.toFixed(1) ?? 0],
    ['Maximum depth', d3.max(data, d => d.depth) ?? 0],
    ['Average file length',
      d3.mean(fileLengths, d => d[1])?.toFixed(1) ?? 0],
  ];

  for (const [label, value] of stats) {
    const stat = dl.append('div').attr('class', 'stat');
    stat.append('dt').text(label);
    stat.append('dd').text(value);
  }
}

// Tooltip
function renderTooltipContent(commit) {
  const link = document.getElementById('commit-link');

  link.textContent = commit.id;
  link.href = commit.url;

  document.getElementById('commit-date').textContent =
    commit.datetime.toLocaleDateString('en-US', {
      dateStyle: 'full',
    });

  document.getElementById('commit-time').textContent =
    commit.datetime.toLocaleTimeString('en-US', {
      timeStyle: 'short',
    });

  document.getElementById('commit-author').textContent =
    commit.author;

  document.getElementById('commit-lines').textContent =
    commit.totalLines;
}

function updateTooltipVisibility(visible) {
  document.getElementById('commit-tooltip').hidden = !visible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');

  const x = Math.min(
    event.clientX + 15,
    window.innerWidth - tooltip.offsetWidth - 10
  );

  const y = Math.min(
    event.clientY + 15,
    window.innerHeight - tooltip.offsetHeight - 10
  );

  tooltip.style.left = `${Math.max(8, x)}px`;
  tooltip.style.top = `${Math.max(8, y)}px`;
}

// Selection helpers
function isCommitSelected(selection, commit) {
  if (!selection) return false;

  const [[x0, y0], [x1, y1]] = selection;
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);

  return x >= x0 && x <= x1 &&
         y >= y0 && y <= y1;
}

function renderSelectionCount(selected) {
  document.getElementById('selection-count').textContent =
    selected.length
      ? `${selected.length} commits selected`
      : 'No commits selected';
}

function renderLanguageBreakdown(selected) {
  const dl = d3.select('#language-breakdown');
  dl.selectAll('*').remove();

  if (!selected.length) return;

  const lines = selected.flatMap(d => d.lines);

  const languages = d3.rollup(
    lines,
    v => v.length,
    d => d.type
  );

  for (const [language, count] of languages) {
    const stat = dl.append('div').attr('class', 'stat');

    stat.append('dt').text(language || 'Unknown');
    stat.append('dd').text(
      `${count} lines (${d3.format('.1%')(count / lines.length)})`
    );
  }
}

function brushed(event) {
  activeSelection = event.selection;

  const selected = activeSelection
    ? filteredCommits.filter(d =>
        isCommitSelected(activeSelection, d))
    : [];

  d3.select('#chart svg')
    .selectAll('.dots circle')
    .classed('selected', d =>
      isCommitSelected(activeSelection, d)
    );

  renderSelectionCount(selected);
  renderLanguageBreakdown(selected);
}

// Original scatter plot
function renderScatterPlot(commits) {
  const width = 1000;
  const height = 600;

  const margin = {
    top: 20,
    right: 30,
    bottom: 50,
    left: 70,
  };

  const bounds = {
    left: margin.left,
    right: width - margin.right,
    top: margin.top,
    bottom: height - margin.bottom,
  };

  const svg = d3.select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`);

  xScale = d3.scaleTime()
    .domain(d3.extent(commits, d => d.datetime))
    .range([bounds.left, bounds.right])
    .nice();

  yScale = d3.scaleLinear()
    .domain([0, 24])
    .range([bounds.bottom, bounds.top]);

  rScale = d3.scaleSqrt()
    .domain([0, d3.max(commits, d => d.totalLines) || 1])
    .range([2, 30]);

  // Gridlines
  svg.append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${bounds.left},0)`)
    .call(
      d3.axisLeft(yScale)
        .tickSize(-(bounds.right - bounds.left))
        .tickFormat('')
    );

  // X-axis
  svg.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${bounds.bottom})`)
    .call(d3.axisBottom(xScale));

  // Y-axis
  svg.append('g')
    .attr('class', 'y-axis')
    .attr('transform', `translate(${bounds.left},0)`)
    .call(
      d3.axisLeft(yScale)
        .tickFormat(d => `${String(d).padStart(2, '0')}:00`)
    );

  // Axis labels
  svg.append('text')
    .attr('class', 'axis-label')
    .attr('x', width / 2)
    .attr('y', height - 5)
    .attr('text-anchor', 'middle')
    .text('Commit Date');

  svg.append('text')
    .attr('class', 'axis-label')
    .attr('transform', 'rotate(-90)')
    .attr('x', -height / 2)
    .attr('y', 18)
    .attr('text-anchor', 'middle')
    .text('Time of Day');

  // Commit circles
  const sortedCommits = d3.sort(
    commits,
    d => -d.totalLines
  );

  svg.append('g')
    .attr('class', 'dots')
    .selectAll('circle')
    .data(sortedCommits, d => d.id)
    .join('circle')
    .attr('cx', d => xScale(d.datetime))
    .attr('cy', d => yScale(d.hourFrac))
    .attr('r', d => rScale(d.totalLines))
    .on('mouseenter', (event, commit) => {
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mousemove', updateTooltipPosition)
    .on('mouseleave', () => {
      updateTooltipVisibility(false);
    });

  // Brush
  brush = d3.brush()
    .extent([
      [bounds.left, bounds.top],
      [bounds.right, bounds.bottom],
    ])
    .on('start brush end', brushed);

  brushGroup = svg.append('g')
    .attr('class', 'brush')
    .call(brush);
}

// Step 1.2: Update existing scatter plot
function updateScatterPlot(commits) {
  const svg = d3.select('#chart').select('svg');

  // Keep the time axis stable when no commits are visible
  if (commits.length > 1) {
    xScale.domain(d3.extent(commits, d => d.datetime)).nice();
  } else if (commits.length === 1) {
    const t = commits[0].datetime.getTime();
    xScale.domain([
      new Date(t - 86400000),
      new Date(t + 86400000),
    ]);
  }

  // Update the existing x-axis
  const xAxis = d3.axisBottom(xScale);
  const xAxisGroup = svg.select('g.x-axis');

  xAxisGroup.selectAll('*').remove();
  xAxisGroup.call(xAxis);

  const dots = svg.select('g.dots');

  const sortedCommits = d3.sort(
    commits,
    d => -d.totalLines
  );

  // Step 1.3: Keyed data join
  dots
    .selectAll('circle')
    .data(sortedCommits, d => d.id)
    .join('circle')
    .attr('cx', d => xScale(d.datetime))
    .attr('cy', d => yScale(d.hourFrac))
    .attr('r', d => rScale(d.totalLines))
    .on('mouseenter', (event, commit) => {
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mousemove', updateTooltipPosition)
    .on('mouseleave', () => {
      updateTooltipVisibility(false);
    });

  // Reset the brush after filtering
  brushGroup.call(brush.move, null);
}

// Step 2: File unit visualization
function updateFileDisplay(filteredCommits) {
  let lines = filteredCommits.flatMap(d => d.lines);

  let files = d3
    .groups(lines, d => d.file)
    .map(([name, lines]) => {
      return { name, lines };
    })
    .sort((a, b) => b.lines.length - a.lines.length);

  let filesContainer = d3
    .select('#files')
    .selectAll(':scope > div')
    .data(files, d => d.name)
    .join(
      enter =>
        enter.append('div').call(div => {
          div.append('dt').append('code');
          div.select('dt').append('small');
          div.append('dd');
        })
    );

  // Keep rows in sorted order
  filesContainer.order();

  filesContainer.select('dt > code')
    .text(d => d.name);

  filesContainer.select('dt > small')
    .text(d => `${d.lines.length} lines`);

  // One dot per line
  filesContainer
    .select('dd')
    .selectAll('div')
    .data(d => d.lines)
    .join('div')
    .attr('class', 'loc')
    .attr('style', d => `--color: ${colors(d.type)}`);
}

// Step 1.1 and 1.2: Slider filtering
function onTimeSliderChange() {
  commitProgress = Number(
    document.getElementById('commit-progress').value
  );

  commitMaxTime = timeScale.invert(commitProgress);

  document.getElementById('commit-max-time').textContent =
    commitMaxTime.toLocaleString('en-US', {
      dateStyle: 'long',
      timeStyle: 'short',
    });

  filteredCommits = commits.filter(
    d => d.datetime <= commitMaxTime
  );

  updateScatterPlot(filteredCommits);
  updateFileDisplay(filteredCommits);

  renderCommitInfo(
    filteredCommits.flatMap(d => d.lines),
    filteredCommits
  );
}

// Step 3.2: Generate commit text
function renderCommitStory() {
  d3.select('#scatter-story')
    .selectAll('.step')
    .data(commits, d => d.id)
    .join('div')
    .attr('class', 'step')
    .html((d, i) => `
      On ${d.datetime.toLocaleString('en', {
        dateStyle: 'full',
        timeStyle: 'short',
      })},
      I made
      <a href="${d.url}" target="_blank">
        ${i > 0
          ? 'another glorious commit'
          : 'my first commit, and it was glorious'}
      </a>.
      I edited ${d.totalLines} lines across
      ${d3.rollups(
        d.lines,
        D => D.length,
        d => d.file
      ).length} files.
      Then I looked over all I had made, and I saw that it was very good.
    `);
}

// Step 3.3: Scrollama
function onStepEnter(response) {
  const commit = response.element.__data__;

  // Use the same time filtering as the slider
  commitMaxTime = commit.datetime;
  commitProgress = timeScale(commitMaxTime);

  document.getElementById('commit-progress').value =
    commitProgress;

  filteredCommits = commits.filter(
    d => d.datetime <= commitMaxTime
  );

  document.getElementById('commit-max-time').textContent =
    commitMaxTime.toLocaleString('en-US', {
      dateStyle: 'long',
      timeStyle: 'short',
    });

  updateScatterPlot(filteredCommits);

  // Highlight the active story step
  d3.selectAll('#scatter-story .step')
    .classed('active', false);

  d3.select(response.element).classed('active', true);
}

// Initialize
try {
  data = await loadData();
  commits = processCommits(data);
  filteredCommits = commits;

  if (commits.length) {
    timeScale = d3.scaleTime()
      .domain([
        d3.min(commits, d => d.datetime),
        d3.max(commits, d => d.datetime),
      ])
      .range([0, 100]);

    commitMaxTime = timeScale.invert(commitProgress);

    renderScatterPlot(commits);
    renderCommitStory();

    document.getElementById('commit-progress')
      .addEventListener('input', onTimeSliderChange);

    onTimeSliderChange();

    const scroller = scrollama();

    scroller
      .setup({
        container: '#scrolly-1',
        step: '#scrolly-1 .step',
        offset: 0.5,
      })
      .onStepEnter(onStepEnter);

    window.addEventListener('resize', () => scroller.resize());
  } else {
    d3.select('#chart').text('No commit data found.');
  }
} catch (error) {
  console.error(error);
  d3.select('#chart')
    .text('Could not load loc.csv. Check your file and server.');
}
