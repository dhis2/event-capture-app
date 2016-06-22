/* Directives */
var eventCaptureDirectives = angular.module('eventCaptureDirectives', [])
.directive('modalBody', function (){
    return {
        restrict: 'E',
        templateUrl: 'views/modal-body.html',
        scope: {
            body: '='
        },
        controller: [
            '$scope',
            '$translate',
            function($scope, $translate){
                
            }
        ]
    }
});

