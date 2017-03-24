import './eventCaptureModule';

// Tracker core
import 'd2-tracker/lib/dhis2.angular.services.js';
import 'd2-tracker/lib/dhis2.angular.directives.js';
import 'd2-tracker/lib/dhis2.angular.validations.js';
import 'd2-tracker/lib/dhis2.angular.filters.js';
import 'd2-tracker/lib/dhis2.angular.controllers.js';
import 'd2-tracker/lib/dhis2.angular.templates.js';

import L from 'leaflet';
import 'leaflet-geocoder-mapzen';
import 'leaflet-contextmenu';
import 'd2-tracker/lib/Google.js';

L.Icon.Default.imagePath = '../dhis-web-commons/leaflet/images';

import '../scripts/services.js';
import '../scripts/filters.js';
import '../scripts/directives.js';
import '../scripts/controllers.js';
import './ng-csv.js';

angular.module('eventCapture')

.value('DHIS2URL', '../api/26')

.value('DHIS2COORDINATESIZE', 6)

.config(function ($routeProvider, $translateProvider, $logProvider) {

    $routeProvider.when('/', {
        templateUrl: 'views/home.html',
        controller: 'MainController',
        reloadOnSearch: false
    }).otherwise({
        redirectTo: '/'
    });

    $translateProvider.preferredLanguage('en');
    $translateProvider.useSanitizeValueStrategy('escaped');
    $translateProvider.useLoader('i18nLoader');

    $logProvider.debugEnabled(false);
});
