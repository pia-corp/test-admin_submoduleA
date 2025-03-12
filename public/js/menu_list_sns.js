function menuListSnsFunction() {
  var menuBtn  = $('.menu-btn');
  var headerLinkBlock  = $('.header-link-block');
  
  var menuBtnWidth = menuBtn.width();
  var headerLinkBlockWidth = headerLinkBlock.width();
  
  var snsLinkRight = ( (headerLinkBlockWidth + menuBtnWidth) * 1.18 );
  $('.menu-list_sns').css('right', snsLinkRight);
};
$(document).ready(menuListSnsFunction);
$(window).on('resize',menuListSnsFunction);