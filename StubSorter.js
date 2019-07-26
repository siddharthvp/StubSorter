// <nowiki>
$.when(mw.loader.using([ 'mediawiki.util', 'mediawiki.api', 'jquery.chosen' ]), $.ready).then(function() {

	// auto start the script when navigating to an article from CAT:STUBS
	if (mw.config.get('wgPageName') === 'Category:Stubs') {
		$('#mw-pages li a').each(function(i,e) {
			e.href += '?startstubsorter=y';
		});
		return;
	}

	if (
	   (mw.config.get('wgNamespaceNumber') !== 0 && mw.config.get('wgPageName') !== 'Wikipedia:Sandbox') ||  // non-articles
		mw.config.get('wgRevisionId') === 0 ||  // non-existent articles
		mw.config.get('wgCurRevisionId') !== mw.config.get('wgRevisionId')  // old revisions
	) return;

	$(mw.util.addPortletLink(getPref('portlet', 'p-cactions'), '#', 'Stub Sort', 'ca-stub', 'Add or remove stub tags')).click(function(e) {
		e.preventDefault();

		// if already present, don't duplicate
		if ( $('#stub-sorter-wrapper').length !== 0 ) return;

		var api = new mw.Api( {
			ajax: {
				headers: {
					'Api-User-Agent': '[[w:User:SD0001/StubSorter.js]]'
				}
			}
		} );

		function getStubsBy(searchType, searchStr, extended) {
			return new Promise(function(resolve, reject) {
				var query = {
					"action": "query",
					"list": "search",
					"srsearch": 'incategory:"Stub message templates" ',
					"srnamespace": "10",
					"srlimit": extended ? "500" : "100",
					"srqiprofile": "classic",
					"srprop": "",
					"srsort": "relevance"
				};
				switch (searchType) {
					case 'prefix':
						query.srsearch += 'prefix:"Template:' + searchStr + '"';
						break;
					case 'intitle':
						var searchStrWords = searchStr.split(' ').filter(function(e) { return !/^\s*$/.test(e); });
						query.srsearch += 'intitle:"' + searchStrWords.join('" intitle:"') + '"';
						break;
					case 'regex':
						query.srsearch += 'intitle:/' + mw.RegExp.escape(searchStr) + '/i';
						break;
				}

				api.get(query).then(function(response) {
					if (response && response.query && response.query.search) {
						resolve(response.query.search.map( function(e) {
							return e.title.slice(9);
						}));
					} else {
						reject(JSON.stringify(response));
					}
				}).fail(function(e) {
					reject(JSON.stringify(e));
				});
			});
		}

		$('#mw-content-text').before(
			$('<div>').attr('id', 'stub-sorter-wrapper').css({
				'max-height': 'max-content',
				'background-color': '#c0ffec',
				'margin-bottom': '10px'
			}).append(
				$('<select>').attr('id', 'stub-sorter-select').attr('multiple', 'true').change(function() {

					// Show preview
					var $this = $(this);
					var selectedTags = $this.val();
					if (selectedTags.length) {
						var tagsWikitext = '{{' + selectedTags.join('}}\n{{') + '}}';

						api.parse(tagsWikitext).then(function(parsedhtmldiv) {

							// Do nothing if tag selection has changed since we sent the parse API call
							// comparing lengths is enough
							if (selectedTags.length !== $this.val().length) {
								return;
							}
							$('#stub-sorter-previewbox').html(parsedhtmldiv);
						});
					} else {
						$('#stub-sorter-previewbox').empty();
					}
					//$input.css('width', '100%');  // doesn't work
				})
			).append(
				$('<div>').attr('id', 'stub-sorter-previewbox').css({
					'background-color': '#cfd8eb', // '#98b685'
					//'border-bottom': 'solid 0.5px #aaaaaa'
				})
			)

		);

		var $select = $('#stub-sorter-select');

		var existingStubs = $('.stub .hlist .nv-view a').map(function(i,e) {
			return e.title.slice(9);
		}).get();

		existingStubs.forEach(function(e) {
			$select.append(
				$('<option>').text(e).val(e).attr('selected', 'true')
			);
		});

		$select.chosen({
			search_contains: true,
			placeholder_text_multiple: 'Start typing to add a stub tag...',
			width: '100%',

			// somehow beacuse of the hacks below, the no_results_text shows up
			// when the search results are loading, and not when there are no results
			no_results_text: 'Loading results for'
		});

		var $input = $('#stub_sorter_select_chosen input');

		var menuFrozen = false;
		var searchBy = getPref('searchBy', 'prefix');

		$('#stub_sorter_select_chosen .chosen-choices').after(

			$('<div>').append(

				// Freeze button
				$('<span>').append(
					$('<a>').text('Freeze menu ').click(function() {
						menuFrozen = !menuFrozen;
						if (menuFrozen) {
							$(this).text('Unfreeze menu ');
							$(this).parent().css('font-weight', 'bold');
						} else {
							$(this).text('Freeze menu ');
							$(this).parent().css('font-weight', 'normal');
						}
						$input[0].focus();
						$input.trigger('keyup');
					}).css({
						'padding-right': '100px',
						'padding-left': '5px'
					})
				),

				// Search mode select
				$('<select>').append(
					$('<option>').text('List prefix matches first').val('prefix'),
					$('<option>').text('List intitle matches first').val('intitle'),
					$('<option>').text('Use strict character-match search').val('regex')
				).change(function(e) {
					searchBy = e.target.value;
					$input.trigger('keyup');
				}),

				// help button after the search mode select
				$('<small>').append(
					' (', $('<a>').text('help').attr('href', '/wiki/User:SD0001/StubSorter#Search_modes').attr('target', '_blank'), ')'
				)
			).css({
				'border-bottom': 'solid 0.5px #aaaaaa',
				'border-left': 'solid 0.5px #aaaaaa',
				'border-right': 'solid 0.5px #aaaaaa'
			})

		);

		// Save button
		var $save = $('<button>')
			.text('Save').css({
				'float': 'right'
			})
			.click(submit)
			.insertAfter($('#stub_sorter_select_chosen .chosen-choices'));
		function submit() {
			$('#stub-sorter-error').remove();
			var $status = $('<div>').text('Fetching page...').css({
				'float': 'right'
			});
			$(this).replaceWith($status);
			api.edit(mw.config.get('wgPageName'), function(revision) {
				$status.text('Saving page...');
				var pageText = revision.content;

				var tagsBefore = (pageText.match(/\{\{[^{]*?[sS]tub(?:\|.*?)?\}\}/g) || []).map(function(e) {
					// capitalise first char after {{
					return e[0] + e[1] + e[2].toUpperCase() + e.slice(3);
				});
				var tagsAfter = $select.val().map(function(e) { return '{{' + e + '}}'; });

				// remove all stub tags
				pageText = pageText.replace(/\{\{[^{]*[sS]tub(\|.*?)?\}\}\s*/g, '').trim();

				// add selected stub tags
				pageText += '\n\n\n' + tagsAfter.join('\n'); 	// per [[MOS:LAYOUT]]

				// For producing edit summary
				var summary = '';

				var tagsAdded = tagsAfter.filter(function(e) {
					return tagsBefore.indexOf(e) === -1;
				});
				var tagsRemoved = tagsBefore.filter(function(e) {
					return tagsAfter.indexOf(e) === -1;
				});

				tagsRemoved.forEach(function(e) {
					summary += '–' + e + ', ';
				});
				tagsAdded.forEach(function(e) {
					summary += '+' + e + ', ';
				});
				summary = summary.slice(0, -2); // remove the final ', '

				return {
					text: pageText,
					summary: summary + ' using [[User:SD0001/StubSorter|StubSorter]]',
					nocreate: 1,
					minor: getPref('minor', true),
					watchlist: getPref('watchlist', 'nochange')
				};
			}).then(function() {
				$status.text('Done. Reloading page...');
				setTimeout(function() {
					window.location.reload(true);
				}, 500);
			}).fail(function(e) {
				$status.text('Save failed. Please try again. ')
						.attr('id', 'stub-sorter-error')
						.css({
							'color': 'red',
							'font-weight': 'bold'
						});
				console.error(e);
				setTimeout(function() {
					$status.before($save);
					$save.click(submit);
				}, 500);
			});
		}

		// hide selected items in dropdown
		mw.util.addCSS('#stub_sorter_select_chosen .chosen-results .result-selected { display: none; }');

		// Focus on the search box as soon as the the sorter menu loads
		// Add placeholder, because chosen's native placeholder doesn't work with a changing menu.
		// Reset the search box width to accomodate the placeholder text
		// Keep resetting whenever the input goes out of focus
		$input
			.focus()
			.attr('placeholder', 'Start typing to add a stub tag...')
			.css('width', '200px')
			.blur(function() {
				$(this).css('width', '100%');
			});

		// also reset it when an option is selected by clicking on it
		// or when clicking on the search box after the $input has become narrow (despite our best efforts...)
		$('.chosen-container').click(function() {
			$input.css('width', '100%');
		});

		// Adapted from [[User:Enterprisey/afch-master.js/submissions.js]]'s category selection menu:
		// Offer dynamic suggestions!
		// Since jquery.chosen doesn't natively support dynamic results,
		// we sneakily inject some dynamic suggestions instead.
		// Consider upgrading to select2 or OOUI to avoid these hacks
		$input.keyup(function(e) {
			var searchStr = $input.val();

			// The worst hack. Because Chosen keeps messing with the
			// width of the text box, keep on resetting it to 100%
			$input.css( 'width', '100%' );
			$input.parent().css( 'width', '100%' );

			// Ignore arrow keys and home/end keys to allow users to navigate through the suggestions or through the search query
			// and don't show results when an empty string is provided
			if ( (e.which >= 35 && e.which <=40) || (menuFrozen && e.which !== undefined) || !searchStr ) {
				return;
			}

			// true when fake keyup is produced by the Freeze button
			// in this case, api limit has to be raised to 500
			var extended = e.which === undefined;

			$.when(
				searchBy !== 'regex' ? getStubsBy('prefix', searchStr, extended ) : undefined,
				searchBy !== 'regex' ? getStubsBy('intitle', searchStr, extended ) : undefined,
				searchBy === 'regex' ? getStubsBy('regex', searchStr, extended ) : undefined
			).then( function( stubsPrefix, stubsIntitle, stubsRegex ) {

				var stubs;
				switch (searchBy) {
					case 'prefix': stubs = uniqElements(stubsPrefix, stubsIntitle); break;
					case 'intitle': stubs = uniqElements(stubsIntitle, stubsPrefix); break;
					case 'regex': stubs = stubsRegex; break;
				}

				// Reset the text box width again
				$input.css( 'width', '100%' );
				$input.parent().css( 'width', '100%' );

				// If the input has changed since we started searching,
				// don't show outdated results
				if ( $input.val() !== searchStr ) {
					return;
				}

				// Clear existing suggestions
				$select.children().not( ':selected' ).remove();

				// Now, add the new suggestions
				stubs.forEach(function (stub) {

					// do not add if already selected
					if ($select.val().indexOf(stub) !== -1) {
						return;
					}
					$select.append(
						$('<option>').text(stub).val(stub)
					);
				} );

				// We've changed the <select>, now tell Chosen to
				// rebuild the visible list
				$select.trigger( 'liszt:updated' );
				$select.trigger( 'chosen:updated' );
				$input.val( searchStr );
				$input.css( 'width', '100%' );
				$input.parent().css( 'width', '100%' );

			}).catch(function(e) {
				if ( $input.val() !== searchStr ) {
					return;
				}
				$select.children().not(':selected').remove();
				$select.append(
					$('<option>')
						.text('Error fetching results: ' + e)
						.attr('disabled', 'true')
				);
				$select.trigger( 'liszt:updated' );
				$select.trigger( 'chosen:updated' );
				$input.val( searchStr );
				$input.css( 'width', '100%' );
				$input.parent().css( 'width', '100%' );
			});

		});

	});

	if (mw.util.getParamValue('startstubsorter')) {
		setTimeout( function() { $('#ca-stub').click(); }, 1000);
	}

	// utility function to get unique elements from 2 arrays
	function uniqElements(arr1, arr2) {
		var obj = {};
		for( var i = 0; i < arr1.length; i++ ) {
			obj[arr1[i]] = 0;
		}
		for( var i = 0; i < arr2.length; i++ ) {
			obj[arr2[i]] = 0;
		}
		return Object.keys(obj);
	}

	// function to obtain a preference option from common.js
	function getPref(name, defaultVal) {
		if (window['StubSorter_' + name] === undefined) {
			return defaultVal;
		} else {
			return window['StubSorter_' + name];
		}
	}

});
// </nowiki>