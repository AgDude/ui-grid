(function () {
  'use strict';

  var module = angular.module('ui.grid');
  
  module.directive('uiGridRenderContainer', ['$timeout', '$document', 'uiGridConstants', 'gridUtil', 'ScrollEvent',
    function($timeout, $document, uiGridConstants, gridUtil, ScrollEvent) {
    return {
      replace: true,
      transclude: true,
      templateUrl: 'ui-grid/uiGridRenderContainer',
      require: ['^uiGrid', 'uiGridRenderContainer'],
      scope: {
        containerId: '=',
        rowContainerName: '=',
        colContainerName: '=',
        bindScrollHorizontal: '=',
        bindScrollVertical: '=',
        enableVerticalScrollbar: '=',
        enableHorizontalScrollbar: '='
      },
      controller: 'uiGridRenderContainer as RenderContainer',
      compile: function () {
        return {
          pre: function prelink($scope, $elm, $attrs, controllers) {
            // gridUtil.logDebug('render container ' + $scope.containerId + ' pre-link');

            var uiGridCtrl = controllers[0];
            var containerCtrl = controllers[1];

            var grid = $scope.grid = uiGridCtrl.grid;

            // Verify that the render container for this element exists
            if (!$scope.rowContainerName) {
              throw "No row render container name specified";
            }
            if (!$scope.colContainerName) {
              throw "No column render container name specified";
            }

            if (!grid.renderContainers[$scope.rowContainerName]) {
              throw "Row render container '" + $scope.rowContainerName + "' is not registered.";
            }
            if (!grid.renderContainers[$scope.colContainerName]) {
              throw "Column render container '" + $scope.colContainerName + "' is not registered.";
            }

            var rowContainer = $scope.rowContainer = grid.renderContainers[$scope.rowContainerName];
            var colContainer = $scope.colContainer = grid.renderContainers[$scope.colContainerName];
            
            containerCtrl.containerId = $scope.containerId;
            containerCtrl.rowContainer = rowContainer;
            containerCtrl.colContainer = colContainer;
          },
          post: function postlink($scope, $elm, $attrs, controllers) {
            // gridUtil.logDebug('render container ' + $scope.containerId + ' post-link');

            var uiGridCtrl = controllers[0];
            var containerCtrl = controllers[1];

            var grid = uiGridCtrl.grid;
            var rowContainer = containerCtrl.rowContainer;
            var colContainer = containerCtrl.colContainer;

            var renderContainer = grid.renderContainers[$scope.containerId];

            // Put the container name on this element as a class
            $elm.addClass('ui-grid-render-container-' + $scope.containerId);

            // Bind to left/right-scroll events
            if ($scope.bindScrollHorizontal || $scope.bindScrollVertical) {
              grid.api.core.on.scrollEvent($scope,scrollHandler);
            }

            function scrollHandler (args) {
              // exit if not for this grid
              if (args.grid && args.grid.id !== grid.id){
                return;
              }

              
              // Vertical scroll
              if (args.y && $scope.bindScrollVertical) {
                containerCtrl.prevScrollArgs = args;

                var newScrollTop = args.getNewScrollTop(rowContainer,containerCtrl.viewport);

                //only set scrollTop if we coming from something other than viewPort scrollBar or
                //another column container
                if (args.source !== ScrollEvent.Sources.ViewPortScroll ||
                    args.sourceColContainer !== colContainer) {
                  containerCtrl.viewport[0].scrollTop = newScrollTop;
                }

              }

              // Horizontal scroll
              if (args.x && $scope.bindScrollHorizontal) {
                containerCtrl.prevScrollArgs = args;
                var newScrollLeft = args.getNewScrollLeft(colContainer,containerCtrl.viewport);

                // Make the current horizontal scroll position available in the $scope
                $scope.newScrollLeft = newScrollLeft;                

                if (containerCtrl.headerViewport) {
                  containerCtrl.headerViewport.scrollLeft = gridUtil.denormalizeScrollLeft(containerCtrl.headerViewport, newScrollLeft);
                }

                if (containerCtrl.footerViewport) {
                  containerCtrl.footerViewport.scrollLeft = gridUtil.denormalizeScrollLeft(containerCtrl.footerViewport, newScrollLeft);
                }

                //scroll came from somewhere else, so the viewport must be positioned
                if (args.source !== ScrollEvent.Sources.ViewPortScroll) {
                  containerCtrl.viewport[0].scrollLeft = newScrollLeft;
                }

                containerCtrl.prevScrollLeft = newScrollLeft;
              }
            }

            // Scroll the render container viewport when the mousewheel is used
            $elm.bind('wheel mousewheel DomMouseScroll MozMousePixelScroll', function(evt) {
              // use wheelDeltaY

              var newEvent = gridUtil.normalizeWheelEvent(evt);

              var scrollEvent = new ScrollEvent(grid, rowContainer, colContainer, ScrollEvent.Sources.RenderContainerMouseWheel);
              if (newEvent.deltaY !== 0) {
                var scrollYAmount = newEvent.deltaY * -120;

                // Get the scroll percentage
                var scrollYPercentage = (containerCtrl.viewport[0].scrollTop + scrollYAmount) / rowContainer.getVerticalScrollLength();

                // Keep scrollPercentage within the range 0-1.
                if (scrollYPercentage < 0) { scrollYPercentage = 0; }
                else if (scrollYPercentage > 1) { scrollYPercentage = 1; }

                scrollEvent.y = { percentage: scrollYPercentage, pixels: scrollYAmount };
              }
              if (newEvent.deltaX !== 0) {
                var scrollXAmount = newEvent.deltaX * -120;

                // Get the scroll percentage
                var scrollLeft = gridUtil.normalizeScrollLeft(containerCtrl.viewport);
                var scrollXPercentage = (scrollLeft + scrollXAmount) / (colContainer.getCanvasWidth() - colContainer.getViewportWidth());

                // Keep scrollPercentage within the range 0-1.
                if (scrollXPercentage < 0) { scrollXPercentage = 0; }
                else if (scrollXPercentage > 1) { scrollXPercentage = 1; }

                scrollEvent.x = { percentage: scrollXPercentage, pixels: scrollXAmount };
              }

              // todo: this isn't working when scrolling down.  it works fine for up.  tested on Chrome
              // Let the parent container scroll if the grid is already at the top/bottom
                if ((scrollEvent.y && scrollEvent.y.percentage !== 0 && scrollEvent.y.percentage !== 1 && containerCtrl.viewport[0].scrollTop !== 0 ) ||
                    (scrollEvent.x && scrollEvent.x.percentage !== 0 && scrollEvent.x.percentage !== 1)) {
                  evt.preventDefault();
                  scrollEvent.fireThrottledScrollingEvent();
              }
              
            });

            var startY = 0,
            startX = 0,
            scrollTopStart = 0,
            scrollLeftStart = 0,
            directionY = 1,
            directionX = 1,
            moveStart;

            function touchmove(event) {
              if (event.originalEvent) {
                event = event.originalEvent;
              }

              var deltaX, deltaY, newX, newY;
              newX = event.targetTouches[0].screenX;
              newY = event.targetTouches[0].screenY;
              deltaX = -(newX - startX);
              deltaY = -(newY - startY);

              directionY = (deltaY < 1) ? -1 : 1;
              directionX = (deltaX < 1) ? -1 : 1;

              deltaY *= 2;
              deltaX *= 2;

              var scrollEvent = new ScrollEvent(grid, rowContainer, colContainer, ScrollEvent.Sources.RenderContainerTouchMove);

              if (deltaY !== 0) {
                var scrollYPercentage = (scrollTopStart + deltaY) / rowContainer.getVerticalScrollLength();

                if (scrollYPercentage > 1) { scrollYPercentage = 1; }
                else if (scrollYPercentage < 0) { scrollYPercentage = 0; }

                scrollEvent.y = { percentage: scrollYPercentage, pixels: deltaY };
              }
              if (deltaX !== 0) {
                var scrollXPercentage = (scrollLeftStart + deltaX) / (colContainer.getCanvasWidth() - colContainer.getViewportWidth());

                if (scrollXPercentage > 1) { scrollXPercentage = 1; }
                else if (scrollXPercentage < 0) { scrollXPercentage = 0; }

                scrollEvent.x = { percentage: scrollXPercentage, pixels: deltaX };
              }

              // Let the parent container scroll if the grid is already at the top/bottom
              if ((scrollEvent.y && scrollEvent.y.percentage !== 0 && scrollEvent.y.percentage !== 1) ||
                  (scrollEvent.x && scrollEvent.x.percentage !== 0 && scrollEvent.x.percentage !== 1)) {
                event.preventDefault();
              }
              scrollEvent.fireScrollingEvent();
            }
            
            function touchend(event) {
              if (event.originalEvent) {
                event = event.originalEvent;
              }

              $document.unbind('touchmove', touchmove);
              $document.unbind('touchend', touchend);
              $document.unbind('touchcancel', touchend);

              // Get the distance we moved on the Y axis
              var scrollTopEnd = containerCtrl.viewport[0].scrollTop;
              var scrollLeftEnd = containerCtrl.viewport[0].scrollTop;
              var deltaY = Math.abs(scrollTopEnd - scrollTopStart);
              var deltaX = Math.abs(scrollLeftEnd - scrollLeftStart);

              // Get the duration it took to move this far
              var moveDuration = (new Date()) - moveStart;

              // Scale the amount moved by the time it took to move it (i.e. quicker, longer moves == more scrolling after the move is over)
              var moveYScale = deltaY / moveDuration;
              var moveXScale = deltaX / moveDuration;

              var decelerateInterval = 63; // 1/16th second
              var decelerateCount = 8; // == 1/2 second
              var scrollYLength = 120 * directionY * moveYScale;
              var scrollXLength = 120 * directionX * moveXScale;

              //function decelerate() {
              //  $timeout(function() {
              //    var args = new ScrollEvent(grid, rowContainer, colContainer, ScrollEvent.Sources.RenderContainerTouchMove);
              //
              //    if (scrollYLength !== 0) {
              //      var scrollYPercentage = (containerCtrl.viewport[0].scrollTop + scrollYLength) / rowContainer.getVerticalScrollLength();
              //
              //      args.y = { percentage: scrollYPercentage, pixels: scrollYLength };
              //    }
              //
              //    if (scrollXLength !== 0) {
              //      var scrollXPercentage = (containerCtrl.viewport[0].scrollLeft + scrollXLength) / (colContainer.getCanvasWidth() - colContainer.getViewportWidth());
              //      args.x = { percentage: scrollXPercentage, pixels: scrollXLength };
              //    }
              //
              //    uiGridCtrl.fireScrollingEvent(args);
              //
              //    decelerateCount = decelerateCount -1;
              //    scrollYLength = scrollYLength / 2;
              //    scrollXLength = scrollXLength / 2;
              //
              //    if (decelerateCount > 0) {
              //      decelerate();
              //    }
              //    else {
              //      uiGridCtrl.scrollbars.forEach(function (sbar) {
              //        sbar.removeClass('ui-grid-scrollbar-visible');
              //        sbar.removeClass('ui-grid-scrolling');
              //      });
              //    }
              //  }, decelerateInterval);
              //}

              // decelerate();
            }

            if (gridUtil.isTouchEnabled()) {
              $elm.bind('touchstart', function (event) {
                if (event.originalEvent) {
                  event = event.originalEvent;
                }

                //uiGridCtrl.scrollbars.forEach(function (sbar) {
                //  sbar.addClass('ui-grid-scrollbar-visible');
                //  sbar.addClass('ui-grid-scrolling');
                //});

                moveStart = new Date();
                startY = event.targetTouches[0].screenY;
                startX = event.targetTouches[0].screenX;
                scrollTopStart = containerCtrl.viewport[0].scrollTop;
                scrollLeftStart = containerCtrl.viewport[0].scrollLeft;
                
                $document.on('touchmove', touchmove);
                $document.on('touchend touchcancel', touchend);
              });
            }

            $elm.bind('$destroy', function() {
              $elm.unbind('keydown');

              ['touchstart', 'touchmove', 'touchend','keydown', 'wheel', 'mousewheel', 'DomMouseScroll', 'MozMousePixelScroll'].forEach(function (eventName) {
                $elm.unbind(eventName);
              });
            });
            
            // TODO(c0bra): Handle resizing the inner canvas based on the number of elements
            function update() {
              var ret = '';

              var canvasWidth = colContainer.getCanvasWidth();
              var viewportWidth = colContainer.getViewportWidth();

              var canvasHeight = rowContainer.getCanvasHeight();

              //add additional height for scrollbar on left and right container
              if ($scope.containerId !== 'body') {
                canvasHeight += grid.scrollbarHeight;
              }

              var viewportHeight = rowContainer.getViewportHeight();

              var headerViewportWidth = colContainer.getHeaderViewportWidth();
              var footerViewportWidth = colContainer.getHeaderViewportWidth();
              
              // Set canvas dimensions
              ret += '\n .grid' + uiGridCtrl.grid.id + ' .ui-grid-render-container-' + $scope.containerId + ' .ui-grid-canvas { width: ' + canvasWidth + 'px; height: ' + canvasHeight + 'px; }';

              ret += '\n .grid' + uiGridCtrl.grid.id + ' .ui-grid-render-container-' + $scope.containerId + ' .ui-grid-header-canvas { width: ' + (canvasWidth + grid.scrollbarWidth) + 'px; }';
              
              ret += '\n .grid' + uiGridCtrl.grid.id + ' .ui-grid-render-container-' + $scope.containerId + ' .ui-grid-viewport { width: ' + viewportWidth + 'px; height: ' + viewportHeight + 'px; }';
              ret += '\n .grid' + uiGridCtrl.grid.id + ' .ui-grid-render-container-' + $scope.containerId + ' .ui-grid-header-viewport { width: ' + headerViewportWidth + 'px; }';

              ret += '\n .grid' + uiGridCtrl.grid.id + ' .ui-grid-render-container-' + $scope.containerId + ' .ui-grid-footer-canvas { width: ' + canvasWidth + grid.scrollbarWidth + 'px; }';
              ret += '\n .grid' + uiGridCtrl.grid.id + ' .ui-grid-render-container-' + $scope.containerId + ' .ui-grid-footer-viewport { width: ' + footerViewportWidth + 'px; }';

              // If the render container has an "explicit" header height (such as in the case that its header is smaller than the other headers and needs to be explicitly set to be the same, ue thae)
              if (renderContainer.explicitHeaderHeight !== undefined && renderContainer.explicitHeaderHeight !== null && renderContainer.explicitHeaderHeight > 0) {
                ret += '\n .grid' + uiGridCtrl.grid.id + ' .ui-grid-render-container-' + $scope.containerId + ' .ui-grid-header-cell { height: ' + renderContainer.explicitHeaderHeight + 'px; }';
              }
              // Otherwise if the render container has an INNER header height, use that on the header cells (so that all the header cells are the same height and those that have less elements don't have undersized borders)
              else if (renderContainer.innerHeaderHeight !== undefined && renderContainer.innerHeaderHeight !== null && renderContainer.innerHeaderHeight > 0) {
                ret += '\n .grid' + uiGridCtrl.grid.id + ' .ui-grid-render-container-' + $scope.containerId + ' .ui-grid-header-cell { height: ' + renderContainer.innerHeaderHeight + 'px; }';
              }

              return ret;
            }
            
            uiGridCtrl.grid.registerStyleComputation({
              priority: 6,
              func: update
            });
          }
        };
      }
    };

  }]);

  module.controller('uiGridRenderContainer', ['$scope', 'gridUtil', function ($scope, gridUtil) {
    var self = this;

    self.rowStyle = function (index) {
      var renderContainer = $scope.grid.renderContainers[$scope.containerId];

      var styles = {};
      
      if (!renderContainer.disableRowOffset) {
        if (index === 0 && self.currentTopRow !== 0) {
          // The row offset-top is just the height of the rows above the current top-most row, which are no longer rendered
          var hiddenRowWidth = ($scope.rowContainer.currentTopRow) *
            $scope.rowContainer.visibleRowCache[$scope.rowContainer.currentTopRow].height;

          // return { 'margin-top': hiddenRowWidth + 'px' };
          //gridUtil.logDebug('margin-top ' + hiddenRowWidth );
          styles['margin-top'] = hiddenRowWidth + 'px';
        }
      }
      
      if (!renderContainer.disableColumnOffset && $scope.colContainer.currentFirstColumn !== 0) {
        if ($scope.grid.isRTL()) {
          styles['margin-right'] = $scope.colContainer.columnOffset + 'px';
        }
        else {
          styles['margin-left'] = $scope.colContainer.columnOffset + 'px';
        }
      }

      return styles;
    };

    self.columnStyle = function (index) {
      var renderContainer = $scope.grid.renderContainers[$scope.containerId];

      var self = this;

      if (!renderContainer.disableColumnOffset) {
        if (index === 0 && $scope.colContainer.currentFirstColumn !== 0) {
          var offset = $scope.colContainer.columnOffset;

          if ($scope.grid.isRTL()) {
            return { 'margin-right': offset + 'px' };
          }
          else {
            return { 'margin-left': offset + 'px' }; 
          }
        }
      }

      return null;
    };
  }]);

})();
