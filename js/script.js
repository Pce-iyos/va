
const heatmapMargin = { top: 40, right: 20, bottom: 60, left: 100 },
    heatmapWidth = 900 - heatmapMargin.left - heatmapMargin.right,
    heatmapHeight = 500 - heatmapMargin.top - heatmapMargin.bottom;

const heatmapSvg = d3.select("#heatmap")
    .append("svg")
    .attr("width", heatmapWidth + heatmapMargin.left + heatmapMargin.right)
    .attr("height", heatmapHeight + heatmapMargin.top + heatmapMargin.bottom)
    .append("g")
    .attr("transform", `translate(${heatmapMargin.left},${heatmapMargin.top})`);

const tooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

const timeSpentCategories = ["1hr", "2hr", "3hr", "4hr", "5hr", "6hr+"];

d3.csv("data/smmh.csv").then(data => {
    data.forEach(d => {
        d.Age = +d["1. What is your age?"];
        d.Distraction = +d["12. On a scale of 1 to 5, how easily distracted are you?"];
        d.Depression = +d["18. How often do you feel depressed or down?"];

        const timeSpentMapping = {
            "Less than an Hour": "1hr",
            "Between 1 and 2 hours": "2hr",
            "Between 2 and 3 hours": "3hr",
            "Between 3 and 4 hours": "4hr",
            "Between 4 and 5 hours": "5hr",
            "More than 5 hours": "6hr+"
        };

        d.TimeSpent = timeSpentMapping[d["8. What is the average time you spend on social media every day?"]] || "Unknown";

        d.Platforms = d["7. What social media platforms do you commonly use?"]
            .split(",")
            .map(platform => platform.trim().toLowerCase());

        d["2. Gender"] = d["2. Gender"].toLowerCase().replace(/[^a-z]/g, '').trim();
        d["2. Gender"] = d["2. Gender"] === "male" ? "Male" : d["2. Gender"] === "female" ? "Female" : null;
    });

    
    const genders = [...new Set(data.map(d => d["2. Gender"]).filter(g => g !== null))]; // Filter out null values

    const platforms = [...new Set(data.flatMap(d => d.Platforms))];
    const metrics = ["Distraction", "Depression"];

    d3.select("#filter-gender")
        .selectAll("option")
        .data(["All", ...genders])
        .join("option")
        .attr("value", d => d)
        .text(d => d);

    d3.select("#filter-platform")
        .selectAll("option")
        .data(["All", ...platforms])
        .join("option")
        .attr("value", d => d)
        .text(d => d.charAt(0).toUpperCase() + d.slice(1));

    const xScale = d3.scaleBand()
        .domain(metrics)
        .range([0, heatmapWidth])
        .padding(0.1);

    const yScale = d3.scaleBand()
        .domain(timeSpentCategories)
        .range([0, heatmapHeight])
        .padding(0.1);

    const colorScale = d3.scaleSequential(d3.interpolateReds)
        .domain([1, 5]);

    heatmapSvg.append("g")
        .attr("transform", `translate(0,${heatmapHeight})`)
        .call(d3.axisBottom(xScale));

    heatmapSvg.append("g")
        .call(d3.axisLeft(yScale));

    // Default age to display initially (e.g., max age)
    const defaultAge = 60;
    
    // Render the heatmap with the full dataset and default age
    updateHeatmap(data.filter(d => d.Age <= defaultAge), defaultAge);

    function updateInsights(filteredData, selectedAge) {
        if (filteredData.length === 0) {
            d3.select("#insight-text").text("No data available for the selected filters.");
            return;
        }

        const genderCounts = d3.rollup(filteredData, v => v.length, d => d["2. Gender"]);
        const timeSpentCounts = d3.rollup(filteredData, v => d3.max(v, d => d.Depression), d => d.TimeSpent);

        const maxTimeSpentCategories = [...timeSpentCounts.entries()]
            .filter(([timeSpent, value]) => value === 5)
            .map(([timeSpent]) => timeSpent);

        let timeSpentRange = null;
        if (maxTimeSpentCategories.length > 1) {
            const sortedCategories = maxTimeSpentCategories.sort((a, b) => timeSpentCategories.indexOf(a) - timeSpentCategories.indexOf(b));
            timeSpentRange = `${sortedCategories[0]} to ${sortedCategories[sortedCategories.length - 1]}`;
        } else if (maxTimeSpentCategories.length === 1) {
            timeSpentRange = maxTimeSpentCategories[0];
        }

        const platformCounts = d3.rollup(filteredData.flatMap(d => d.Platforms), v => v.length, d => d);

        const averageDistress = d3.mean(filteredData, d => d.Depression)?.toFixed(2);
        const averageDistraction = d3.mean(filteredData, d => d.Distraction)?.toFixed(2);

        const mostCommonGender = [...genderCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        const mostCommonPlatform = [...platformCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

        const timeSpentMessage = timeSpentRange
            ? `The time spent with maximum distress (value = 5) ranges from <strong>${timeSpentRange}</strong>.`
            : "No maximum distress detected.";

        const insightMessage = `
            The most common gender is <strong>${mostCommonGender || "unknown"}</strong>. 
            The selected age is <strong>${selectedAge}</strong>. 
            ${timeSpentMessage} 
            The platform used is <strong>${mostCommonPlatform || "unknown"}</strong>. 
            The average distraction level is <strong>${averageDistraction || "unknown"}</strong> 
            (on a scale of 1 to 5). The average distress level is <strong>${averageDistress || "unknown"}</strong> 
            (on a scale of 1 to 5).
        `;

        d3.select("#insight-text").html(insightMessage);
    }

    function updateHeatmap(filteredData, selectedAge) {
        const heatmapData = timeSpentCategories.flatMap(timeSpent =>
            metrics.map(metric => {
                const entry = filteredData.find(d => d.TimeSpent === timeSpent);
                return {
                    TimeSpent: timeSpent,
                    metric: metric,
                    value: entry ? entry[metric] : null,
                    Gender: entry ? entry["2. Gender"] : "No data"
                };
            })
        );

        const rects = heatmapSvg.selectAll("rect")
            .data(heatmapData, d => `${d.TimeSpent}-${d.metric}`);

        rects.join(
            enter => enter.append("rect")
                .attr("x", d => xScale(d.metric))
                .attr("y", d => yScale(d.TimeSpent))
                .attr("width", xScale.bandwidth())
                .attr("height", yScale.bandwidth())
                .attr("fill", d => d.value !== null ? colorScale(d.value) : "#e0e0e0")
                .on("mouseover", (event, d) => {
                    tooltip.style("opacity", 1)
                        .html(`
                            <strong>Time Spent:</strong> ${d.TimeSpent}<br>
                            <strong>Metric:</strong> ${d.metric}<br>
                            <strong>Value:</strong> ${d.value !== null ? d.value : "No data"}<br>
                            <strong>Gender:</strong> ${d.Gender}
                        `)
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 20) + "px");
                })
                .on("mouseout", () => tooltip.style("opacity", 0)),
            update => update.transition()
                .duration(500)
                .attr("fill", d => d.value !== null ? colorScale(d.value) : "#e0e0e0"),
            exit => exit.remove()
        );

        updateInsights(filteredData, selectedAge);
    }

    d3.select("#filter-gender").on("change", function () {
        const selectedGender = this.value;
        const selectedPlatform = d3.select("#filter-platform").property("value");
        const selectedAge = +d3.select("#age-slider").property("value");
        const filteredData = data.filter(d =>
            d.Age <= selectedAge &&
            (selectedGender === "All" || d["2. Gender"] === selectedGender) &&
            (selectedPlatform === "All" || d.Platforms.includes(selectedPlatform))
        );
        updateHeatmap(filteredData, selectedAge);
    });

    d3.select("#filter-platform").on("change", function () {
        const selectedGender = d3.select("#filter-gender").property("value");
        const selectedPlatform = this.value;
        const selectedAge = +d3.select("#age-slider").property("value");
        const filteredData = data.filter(d =>
            d.Age <= selectedAge &&
            (selectedGender === "All" || d["2. Gender"] === selectedGender) &&
            (selectedPlatform === "All" || d.Platforms.includes(selectedPlatform))
        );
        updateHeatmap(filteredData, selectedAge);
    });


    const legendWidth = 200;
    const legendHeight = 20;

    const legendSvg = d3.select("#legend")
        .append("svg")
        .attr("width", legendWidth + 40)
        .attr("height", legendHeight + 50);

    const legendGradient = legendSvg.append("defs")
        .append("linearGradient")
        .attr("id", "legend-gradient")
        .attr("x1", "0%")
        .attr("x2", "100%")
        .attr("y1", "0%")
        .attr("y2", "0%");

    legendGradient.selectAll("stop")
        .data(d3.range(0, 1.1, 0.1)) // Generate stops from 0 to 1
        .join("stop")
        .attr("offset", d => `${d * 100}%`)
        .attr("stop-color", d => d3.interpolateReds(d));

    legendSvg.append("rect")
        .attr("x", 20)
        .attr("y", 10)
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .style("fill", "url(#legend-gradient)");

    const legendScale = d3.scaleLinear()
        .domain([1, 5])
        .range([0, legendWidth]);

    const legendAxis = d3.axisBottom(legendScale).ticks(5);

    legendSvg.append("g")
        .attr("transform", `translate(20, ${legendHeight + 10})`)
        .call(legendAxis);

    legendSvg.append("text")
        .attr("x", legendWidth / 2 + 20)
        .attr("y", 60)
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .style("font-weight", "bold")
        .text("Scale of Metrics (1-5)");

        function downloadFilteredData(filteredData) {
            // Get current insights
            const averageDistress = d3.mean(filteredData, d => d.Depression)?.toFixed(2);
            const averageDistraction = d3.mean(filteredData, d => d.Distraction)?.toFixed(2);
            const mostCommonGender = d3.rollup(filteredData, v => v.length, d => d["2. Gender"]);
            const mostUsedPlatform = d3.rollup(filteredData.flatMap(d => d.Platforms), v => v.length, d => d);
        
            const gender = [...mostCommonGender.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown";
            const platform = [...mostUsedPlatform.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown";
        
            // Convert filtered data to CSV
            const csvContent = "data:text/csv;charset=utf-8,"
                + "TimeSpent,Distraction,Depression,Gender\n"
                + filteredData.map(d => `${d.TimeSpent},${d.Distraction},${d.Depression},${d["2. Gender"]}`).join("\n")
                + "\n\nSummary of Insights:\n"
                + `Average Distraction Level,${averageDistraction}\n`
                + `Average Distress Level,${averageDistress}\n`
                + `Most Common Gender,${gender}\n`
                + `Most Used Platform,${platform}`;
        
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "filtered_insights.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
        
        // Function to download the current SVG as a PNG
        function downloadSVGAsPNG() {
            const svgElement = document.querySelector("#heatmap svg");
            const serializer = new XMLSerializer();
            const svgString = serializer.serializeToString(svgElement);
        
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            const image = new Image();
            const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
            const url = URL.createObjectURL(blob);
        
            image.onload = function () {
                canvas.width = svgElement.clientWidth;
                canvas.height = svgElement.clientHeight;
                context.drawImage(image, 0, 0);
        
                // Create PNG and download
                const pngUrl = canvas.toDataURL("image/png");
                const downloadLink = document.createElement("a");
                downloadLink.href = pngUrl;
                downloadLink.download = "heatmap_visualization.png";
                downloadLink.click();
        
                URL.revokeObjectURL(url);
            };
            image.src = url;
        }
        
        // Attach download functionality to the button
        d3.select("#download-insight").on("click", () => {
            const selectedAge = +d3.select("#age-slider").property("value");
            const selectedGender = d3.select("#filter-gender").property("value");
            const selectedPlatform = d3.select("#filter-platform").property("value");
        
            const filteredData = data.filter(d =>
                d.Age <= selectedAge &&
                (selectedGender === "All" || d["2. Gender"] === selectedGender) &&
                (selectedPlatform === "All" || d.Platforms.includes(selectedPlatform))
            );
        
            downloadFilteredData(filteredData);
            downloadSVGAsPNG();
        });
        
    

    d3.select("#age-slider").on("input", function () {
        const selectedAge = +this.value;
        d3.select("#age-value").text(selectedAge);
        const selectedGender = d3.select("#filter-gender").property("value");
        const selectedPlatform = d3.select("#filter-platform").property("value");

        const filteredData = data.filter(d =>
            d.Age <= selectedAge &&
            (selectedGender === "All" || d["2. Gender"] === selectedGender) &&
            (selectedPlatform === "All" || d.Platforms.includes(selectedPlatform))
        );
        updateHeatmap(filteredData, selectedAge);
    });
});
