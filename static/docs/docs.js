// Docs page helpers: copy buttons on code blocks, and highlighting the
// current section in the table of contents while scrolling.
(function () {
	document.querySelectorAll('pre').forEach(function (pre) {
		if (!navigator.clipboard) return;
		var btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'copy-btn';
		btn.textContent = '複製';
		btn.addEventListener('click', function () {
			var code = pre.querySelector('code');
			var text = (code || pre).innerText;
			navigator.clipboard.writeText(text).then(
				function () {
					btn.textContent = '已複製';
					setTimeout(function () {
						btn.textContent = '複製';
					}, 1500);
				},
				function () {
					btn.textContent = '無法複製';
				}
			);
		});
		pre.appendChild(btn);
	});

	var links = Array.prototype.slice.call(document.querySelectorAll('.toc a[href^="#"]'));
	if (!links.length || !('IntersectionObserver' in window)) return;
	var byId = {};
	links.forEach(function (a) {
		byId[a.getAttribute('href').slice(1)] = a;
	});
	var observer = new IntersectionObserver(
		function (entries) {
			entries.forEach(function (entry) {
				if (!entry.isIntersecting) return;
				links.forEach(function (a) {
					a.classList.remove('active');
				});
				var link = byId[entry.target.id];
				if (link) link.classList.add('active');
			});
		},
		{ rootMargin: '-80px 0px -70% 0px' }
	);
	Object.keys(byId).forEach(function (id) {
		var el = document.getElementById(id);
		if (el) observer.observe(el);
	});
})();
