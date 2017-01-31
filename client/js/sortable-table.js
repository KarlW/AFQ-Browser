// ========== Adding Table code ============

var fieldHeight = 30;
var rowPadding = 1;
var fieldWidth = 140;

var previousSort = null;
var format = d3.time.format("%m/%d/%Y");
//var dateFn = function(date) { return format.parse(d.created_at) };


var subjectGroups = false;
var sub_data = []
var splitGroups = false;

var ramp = null;
var headerGrp;
var rowsGrp;
var tableControlBox;

var subjectQ = d3_queue.queue();
subjectQ.defer(d3.json, "data/subjects.json");
subjectQ.await(buildTable);

function buildTable(error, data) {
	data.forEach(function (d) {
        if (typeof d.subjectID === 'number'){
          d.subjectID = "s" + d.subjectID.toString();}
		sub_data.push(d);
	});

	ramp = null;

	var table_svg = d3.select("#table").append("svg")
		.attr("width", d3.keys(sub_data[0]).length * fieldWidth)
		.attr("height", (sub_data.length + 1) * (fieldHeight + rowPadding));

	headerGrp = table_svg.append("g").attr("class", "headerGrp");
	rowsGrp = table_svg.append("g").attr("class","rowsGrp");

	var tableGuiConfigObj = function () {
		this.groupCount = 2;
	};

	var tableGui = new dat.GUI({
		autoplace: false,
		width: 350,
		scrollable: false
	});

	tableControlBox = new tableGuiConfigObj();

	var tableGuiContainer = $('.tableGUI').append($(tableGui.domElement));

	var groupCountController = tableGui.add(tableControlBox, 'groupCount')
		.min(2).step(1)
		.name('Number of Groups')
		.onChange(function () {
			return refreshTable(sortOn);
		});
	tableGui.close()

	groupCountController.onChange(function () {
		refreshTable(sortOn);
	});

	tableGui.close();

	var sortOn = null;
	refreshTable(sortOn);
}

function refreshTable(sortOn){

    // create the table header
    var header = headerGrp.selectAll("g")
        .data(d3.keys(sub_data[0]))
        .enter().append("g")
        .attr("class", "t_header")
        .attr("transform", function (d, i){
            return "translate(" + i * fieldWidth + ",0)";
        })
        .on("mouseover", function (d,i) {
            d3.select(this).style("cursor", "n-resize");
        })
        .on("click", function (d) { return refreshTable(d); }); // this is where the magic happens... (d) is the column being sorted

    header.append("rect")
        .attr("width", fieldWidth-1)
        .attr("height", fieldHeight);

    header.append("text")
        .attr("x", fieldWidth / 2)
        .attr("y", fieldHeight / 2)
        .attr("dy", ".35em")
        .text(String);

    // fill the table
    // select rows
    var rows = rowsGrp.selectAll("g.row").data(sub_data,
        function(d){ return d.subjectID; });

    // create rows
    var rowsEnter = rows.enter().append("svg:g")
        .attr("class","row")
        .attr("id", function(d){ return d.subjectID; })
        .attr("transform", function (d, i){
            return "translate(0," + (i+1) * (fieldHeight+rowPadding) + ")";
        })
        //.on('click', row_select )
        .on('mouseover', table_mouseDown )
        .on('mousedown', row_select );
    // select cells
    var cells = rows.selectAll("g.cell").data(function(d){return d3.values(d);});

    // create cells
    var cellsEnter = cells.enter().append("svg:g")
        .attr("class", "cell")
				.style("opacity",0.3)
        .attr("transform", function (d, i){
            return "translate(" + i * fieldWidth + ",0)";
        });

    cellsEnter.append("rect")
        .attr("width", fieldWidth-1)
        .attr("height", fieldHeight);

    cellsEnter.append("text")
        .attr("x", fieldWidth / 2)
        .attr("y", fieldHeight / 2)
        .attr("dy", ".35em")
        .text(String);

    //update if not in initialisation
    if (sortOn !== null) {
        // update rows
        if(sortOn != previousSort){
            rows.sort(function(a,b){return sort(a[sortOn], b[sortOn]);});
            sub_data.sort(function(a,b){return sort(a[sortOn], b[sortOn]);})
            previousSort = sortOn;
        }
        else{
            rows.sort(function(a,b){return sort(b[sortOn], a[sortOn]);});
            previousSort = null;
        }

		function uniqueNotNull(value, index, self) { 
			return (self.indexOf(value) === index) && (value !== null);
		}

		var uniques = sub_data
			.map(function(element) {
				return element[sortOn];
			})
			.filter(uniqueNotNull);

        var usrGroups = tableControlBox.groupCount;
        var numGroups = Math.min(usrGroups, uniques.length);

		// TODO: Use the datatype json instead of
		// just testing the first element here
		var binScale;
		if (typeof uniques[0] === 'number') {
			binScale = d3.scale.quantile()
				.range(d3.range(numGroups));
		} else {
			var rangeOrdinal = Array(uniques.length);
			for (i = 0; i < numGroups; i++) {
				rangeOrdinal.fill(i,
						i * uniques.length / numGroups,
						(i + 1) * uniques.length / numGroups);
			}
			binScale = d3.scale.ordinal()
				.range(rangeOrdinal);
		}
		binScale.domain(uniques);

		sub_data.map(function(element) {
			if (element[sortOn] === null) {
				return element["bin"] = null;
			} else {
				return element["bin"] = binScale(element[sortOn]);
			}
		});

		// prepare to split on metadata
        splitGroups = d3.nest()
            .key(function (d) { return d["bin"]; })
            .entries(sub_data);

        // push subject ids into respective groups
        subjectGroups = []
        var groupSize = Math.round(sub_data.length / numGroups);
        var splitSize = Math.round(splitGroups.length / numGroups);

        if (splitSize == 1) { // corresponds to one group for each unique value in d[sortOn]
            for (g = 0; g < numGroups; g++) {
                var group_arr = [];
                for (j = 0; j < splitGroups[g].values.length; j++) {
                    group_arr.push(splitGroups[g].values[j].subjectID);
                }
                subjectGroups.push(group_arr);
            }
        } else { // mixed continuous and repeat values (splitSize < groupSize) This part's still messed up!
            for (g = 0; g < numGroups; g++) {
                var group_arr = [];
                var stopGroup = (g + 1) * groupSize;
                for (k = g * groupSize; k < stopGroup; k++) {
                    if (k<splitGroups.length){
                      for (j = 0; j < splitGroups[k].values.length; j++) {
                          group_arr.push(splitGroups[k].values[j].subjectID);
                        }
                    }
                }
                subjectGroups.push(group_arr);
            }
        };

		// color ramp for subject groups
        ramp = d3.scale.linear()
			.domain([0, numGroups-1]).range(["red", "blue"]);

        function IDcolor(element) {
			d3.selectAll('#' + element["subjectID"])
				.selectAll('.line')
				.style("stroke",
						element["bin"] === null ? "black" : ramp(element["bin"]));

			d3.selectAll('#' + element["subjectID"])
				.selectAll('.cell').select('text')
				.style("fill",
						element["bin"] === null ? "black" : ramp(element["bin"]));
        }

        sub_data.forEach(IDcolor); // color lines

        d3.csv("data/nodes.csv", updatePlots); // call update -> noticed there is a delay here. update plots may be the slow down

        rows//.transition() // sort row position
           //.duration(500)
           .attr("transform", function (d, i) {
               return "translate(0," + (i + 1) * (fieldHeight + 1) + ")";
           });

    }
}

function sort(a,b){
    if(typeof a == "string"){
        var parseA = format.parse(a);
        if(parseA){
            var timeA = parseA.getTime();
            var timeB = format.parse(b).getTime();
            return timeA > timeB ? 1 : timeA == timeB ? 0 : -1;
        }
        else
            return a.localeCompare(b);
    }
    else if(typeof a == "number"){
        return a > b ? 1 : a == b ? 0 : -1;
    }
    else if(typeof a == "boolean"){
        return b ? 1 : a ? -1 : 0;
    }
}

function row_select() {                           //onclick function to toggle on and off rows
    if($('g',this).css("opacity") == 0.3){				  //uses the opacity of the row for selection and deselection

        d3.selectAll('#' + this.id)
						.selectAll('g')
            .style("opacity", 1);

				d3.selectAll('#' + this.id)
		        .selectAll('path')
            .style("opacity", 1)
            .style("stroke-width", "2.1px");

    } else {

			d3.selectAll('#' + this.id)
					.selectAll('g')
					.style("opacity", 0.3);

        d3.selectAll('#' + this.id)
						.selectAll('path')
            .style("opacity", plotsControlBox.lineOpacity)
            .style("stroke-width", "1.1px");}
}

var isDown = false;   // Tracks status of mouse button

$(document).mousedown(function() {
    isDown = true;      // When mouse goes down, set isDown to true
})
    .mouseup(function() {
        isDown = false;    // When mouse goes up, set isDown to false
    });


function table_mouseDown() {
    if(isDown) {
        if($('g',this).css("opacity") == 0.3){				  //uses the opacity of the row for selection and deselection

					d3.selectAll('#' + this.id)
							.selectAll('g')
							.style("opacity", 1);

					d3.selectAll('#' + this.id)
							.selectAll('path')
							.style("opacity", 1)
							.style("stroke-width", "2.1px");

        } else {

					d3.selectAll('#' + this.id)
							.selectAll('g')
							.style("opacity", 0.3);

						d3.selectAll('#' + this.id)
								.selectAll('path')
								.style("opacity", plotsControlBox.lineOpacity)
								.style("stroke-width", "1.1px");
							}
    }
}
