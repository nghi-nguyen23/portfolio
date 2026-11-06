
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

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
  return d3.groups(data, (d) => d.commit)
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
      };

      Object.defineProperty(ret, 'lines', {
        value: lines,
        enumerable: false,
      });

      return ret;
    });
}

// Display summary statistics
function renderCommitInfo(data, commits) {
  const container = d3.select('#stats');
  container.selectAll('*').remove();

  const dl = container.append('dl')
    .attr('class', 'stats');

  const fileLengths = d3.rollups(
    data,
    (v) => d3.max(v, (d) => d.line),
    (d) => d.file
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
  link.href = `https://github.com/${repo}/commit/${commit.id}`;

  document.getElementById('commit-date').textContent =
    commit.datetime.toLocaleDateString('en-US', {
      dateStyle: 'full'
    });

  document.getElementById('commit-time').textContent =
    commit.datetime.toLocaleTimeString('en-US', {
      timeStyle: 'short'
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

// Scatterplot
function renderScatterPlot(commits) {
  const width = 1000;
  const height = 600;

  const margin = {
    top: 20,
    right: 30,
    bottom: 50,
    left: 70
  };

  const bounds = {
    left: margin.left,
    right: width - margin.right,
    top: margin.top,
    bottom: height - margin.bottom
  };

  const svg = d3.select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`);

  const xScale = d3.scaleTime()
    .domain(d3.extent(commits, d => d.datetime))
    .range([bounds.left, bounds.right])
    .nice();

  const yScale = d3.scaleLinear()
    .domain([0, 24])
    .range([bounds.bottom, bounds.top]);

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
    .attr('transform', `translate(0,${bounds.bottom})`)
    .call(d3.axisBottom(xScale));

  // Y-axis
  svg.append('g')
    .attr('transform', `translate(${bounds.left},0)`)
    .call(
      d3.axisLeft(yScale)
        .tickFormat(d =>
          `${String(d).padStart(2, '0')}:00`
        )
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

  // Radius scale: proportional circle areas
  const rScale = d3.scaleSqrt()
    .domain([0, d3.max(commits, d => d.totalLines) || 1])
    .range([2, 30]);

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

        stat.append('dt').text(language);

        stat.append('dd').text(
            `${count} lines (${d3.format('.1%')(count / lines.length)})`
        );
    }
}

  function brushed(event) {
    const selection = event.selection;

    const selected = selection
      ? commits.filter(d => isCommitSelected(selection, d))
      : [];

    svg.selectAll('.dots circle')
      .classed('selected', d =>
        isCommitSelected(selection, d)
      );

    renderSelectionCount(selected);
    renderLanguageBreakdown(selected);
  }

  // Add brush
  const brush = d3.brush()
    .extent([
      [bounds.left, bounds.top],
      [bounds.right, bounds.bottom]
    ])
    .on('start brush end', brushed);

  svg.append('g')
    .attr('class', 'brush')
    .call(brush);

  // Draw larger dots first
  const sorted = d3.sort(commits, d => -d.totalLines);

  svg.append('g')
    .attr('class', 'dots')
    .selectAll('circle')
    .data(sorted)
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
}

// Find repository from GitHub Pages URL or edit manually
const repo = 'YOUR_USERNAME/portfolio';

// Initialize visualization
try {
  const data = await loadData();
  const commits = processCommits(data);

  renderCommitInfo(data, commits);

  if (commits.length) {
    renderScatterPlot(commits);
  } else {
    d3.select('#chart').text('No commit data found.');
  }
} catch (error) {
  console.error(error);
  d3.select('#chart')
    .text('Could not load loc.csv. Check your file and server.');
}
