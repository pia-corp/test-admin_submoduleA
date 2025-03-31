$(document).ready(function () {
  const $htmlBody = $('html, body');
  // ***********
  // ** 基本設定
  // ***********
  let lastWindowWidth = window.innerWidth; // リサイズ時のウィンドウ幅
  let currentWindowWidth = window.innerWidth; // 現在のウィンドウ幅
  window.addEventListener('resize', () => {
    currentWindowWidth = window.innerWidth;
    lastWindowWidth = currentWindowWidth;
  });
  const breakpoint = 768; // レスポンシブ幅

  // Accordion Lineup Header
  const $buttonLineupHeaders = $('.js-button-lineup-header');
  const $elementLineupHeader = $('.js-lineup-header');
  $buttonLineupHeaders.each(function () {
    $(this).on('click', function () {
      $elementLineupHeader.fadeToggle();
      $htmlBody.css('overflow-y', $htmlBody.css('overflow-y') === 'hidden' ? 'auto' : 'hidden');
    });
  });
  // Accordion Shop Header
  const $buttonShopHeaders = $('.js-button-shop-header');
  const $elementShopHeader = $('.js-shop-header');
  $buttonShopHeaders.each(function () {
    $(this).on('click', function () {
      $elementShopHeader.fadeToggle();
      $htmlBody.css('overflow-y', $htmlBody.css('overflow-y') === 'hidden' ? 'auto' : 'hidden');
    });
  });

  const $buttonShop = $('.js-button-shop');
  $buttonShop.each(function () {
    $(this).on('click', function () {
      $(this).toggleClass('is-open');
      $(this).children().eq(1).slideToggle(650);
    });
  });

  // Scroll Header Fade
  let lastScrollTop = 0;
  let header = $('.js-header');
  let fadeThreshold = $(window).height() * 0.3; // 100vh
  $(window).scroll(function () {
    let currentScrollTop = $(this).scrollTop();
    if (currentScrollTop > fadeThreshold) {
      if (currentScrollTop > lastScrollTop) {
        header.fadeOut();
      } else {
        header.fadeIn();
      }
    } else {
      header.fadeIn();
    }
    lastScrollTop = currentScrollTop;
  });

  // Scroll Element FadeIn
  const myFunc = function () {
    const target = document.getElementsByClassName('effect-anime');
    const position = Math.floor(window.innerHeight * 0.9); // ViewPort %

    for (let i = 0; i < target.length; i++) {
      let delay;
      if (target[i].classList.contains('effect-delay')) {
        delay = 0.8;
      } else {
        delay = 1;
      }
      let offsetTop = Math.floor(target[i].getBoundingClientRect().top);

      if (offsetTop < position * delay) {
        target[i].classList.add('effect-scroll');
      }
    }
  };
  window.addEventListener('scroll', myFunc, false);

  // Aspect Ratio
  function applyAspectRatioClass(classSelector, width, height) {
    let elements = document.querySelectorAll(classSelector);
    let aspectRatioBase = width / height;

    elements.forEach((element) => {
      let elementWidth = element.offsetWidth;
      let elementHeight = element.offsetHeight;
      let aspectRatio = elementWidth / elementHeight;

      let sources = element.querySelectorAll('picture, picture img');

      sources.forEach((source) => {
        source.classList.remove('aspect-ratio-contain', 'aspect-ratio-cover');

        if (currentWindowWidth >= breakpoint) {
          if (aspectRatio >= aspectRatioBase) {
            source.classList.add('aspect-ratio-contain');
            source.style.objectFit = 'contain';
          } else {
            source.classList.add('aspect-ratio-cover');
            source.style.objectFit = 'cover';
          }
        } else {
          source.classList.add('aspect-ratio-cover');
          source.style.objectFit = 'cover';
        }
      });
    });
  }

  // for fv
  window.addEventListener('resize', function () {
    applyAspectRatioClass('.js-fv-aspect', 1832, 840);
  });
  window.addEventListener('load', function () {
    applyAspectRatioClass('.js-fv-aspect', 1832, 840);
  });
  // for sub-fv
  window.addEventListener('resize', function () {
    applyAspectRatioClass('.js-sub-fv-aspect', 1832, 800);
  });
  window.addEventListener('load', function () {
    applyAspectRatioClass('.js-sub-fv-aspect', 1832, 800);
  });
});
