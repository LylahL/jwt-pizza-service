const os = require('os');
const config = require('./config');
const express = require('express');

let requests = 0;
let putRequests = 0;
let postRequests = 0;
let deleteRequests = 0;
let getRequests = 0;
let latency = 0;
let activeUsers = 0; 

let authSuccess = 0;
let authFailure = 0; 

let pizzasSold = 0; 
let pizzaFailures = 0;
let revenue= 0;
let responseTime = 0;
let purchaseMetrics = {
  count: 0,
  totalCost: 0,
  failures: 0,
  responseTimes: [],
};

function requestTracker(req, res, next) {
  const startTime = Date.now();
  const method = req.method;
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    requests++;
    if (method === 'PUT') putRequests++;
    else if (method === 'POST') postRequests++;
    else if (method === 'DELETE') deleteRequests++;
    else if (method === 'GET') getRequests++;
    latency = duration;
  });

  next();
}

function addActiveUsers() {
  activeUsers ++;
}

function minusActiveUsers() {
if (activeUsers > 0) {
  activeUsers--;
}
}
function setPizzaRespondTime(time){
  responseTime = time;
}

function simulateAuthentication(success = true) {
  if (success) authSuccess++;  
  else authFailure++;
}

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return (cpuUsage * 100).toFixed(2);
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  return ((usedMemory / totalMemory) * 100).toFixed(2);
}
function trackPizzaCreationFailure() {
  pizzaFailures++;
}

function trackPurchase(order) {
  console.log('📦 trackPurchase was called:', order);

  const pizzaCount = order.pizzas;
  const cost = order.totalCost;
  console.log("Cost", cost, "Pizza Count", pizzaCount);

  // Update internal metrics
  purchaseMetrics.count++;
  purchaseMetrics.totalCost += cost;
  purchaseMetrics.responseTimes.push(responseTime);
  console.log('totalCost', purchaseMetrics.totalCost, 'count', purchaseMetrics.count, 'responseTime', responseTime);
  pizzasSold += pizzaCount;
  revenue += cost;
  console.log('pizzasSold', pizzasSold, 'revenue', revenue);
}


function sendMetricsPeriodically(period) {
  setInterval(() => {
    try {
      sendMetricToGrafana('cpu_usage', getCpuUsagePercentage(), 'gauge', '%');
      sendMetricToGrafana('memory_usage', getMemoryUsagePercentage(), 'gauge', '%');

      sendMetricToGrafana('requests_total', requests, 'sum', '1');
      sendMetricToGrafana('get_requests_total', getRequests, 'sum', '1');
      sendMetricToGrafana('post_requests_total', postRequests, 'sum', '1');
      sendMetricToGrafana('put_requests_total', putRequests, 'sum', '1');
      sendMetricToGrafana('delete_requests_total', deleteRequests, 'sum', '1');

      sendMetricToGrafana('latency', latency, 'gauge', 'ms');
      sendMetricToGrafana('active_users', activeUsers, 'sum', '1');

      sendMetricToGrafana('auth_success', authSuccess, 'sum', '1');
      sendMetricToGrafana('auth_failed', authFailure, 'sum', '1');

      sendMetricToGrafana('pizza_creation_latency', responseTime, 'gauge', 'ms');
      sendMetricToGrafana('pizzas_sold', pizzasSold, 'sum', '1');
      sendMetricToGrafana('pizza_creation_failures', pizzaFailures, 'sum', '1');
      console.log('revenue', revenue, 'pizzasSold', pizzasSold, 'pizzaFailures', pizzaFailures);
      sendMetricToGrafana('revenue', revenue, 'sum', '1');

      if (purchaseMetrics.responseTimes.length > 0) {
        const avgResponseTime = purchaseMetrics.responseTimes.reduce((a, b) => a + b, 0) / purchaseMetrics.responseTimes.length;
        sendMetricToGrafana('avg_purchase_response_time', avgResponseTime.toFixed(2), 'gauge', 'ms');
        purchaseMetrics.responseTimes = [];
      }
    } catch (error) {
      console.error('Error sending metrics', error);
    }
  }, period);
}

function sendMetricToGrafana(metricName, metricValue, type, unit) {
  const numericValue = Number(metricValue);
  const valueField = Number.isInteger(numericValue) ? 'asInt' : 'asDouble';
  const metric = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics: [
              {
                name: metricName,
                unit: unit,
                [type]: {
                  dataPoints: [
                    {
                      [valueField]: numericValue,
                      timeUnixNano: Date.now() * 1000000,
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  };

  if (type === 'sum') {
    metric.resourceMetrics[0].scopeMetrics[0].metrics[0][type].aggregationTemporality = 'AGGREGATION_TEMPORALITY_CUMULATIVE';
    metric.resourceMetrics[0].scopeMetrics[0].metrics[0][type].isMonotonic = true;
  }

  const body = JSON.stringify(metric);
  fetch(`${config.metrics.url}`, {
    method: 'POST',
    body: body,
    headers: { Authorization: `Bearer ${config.metrics.apiKey}`, 'Content-Type': 'application/json' },
  })
    .then((response) => {
      if (!response.ok) {
        response.text().then((text) => {
          console.error(`Failed to push metrics data to Grafana: ${text}\n${body}`);
        });
      } else {
        console.log(`Pushed ${metricName} ${numericValue} to Grafana`);
      }
    })
    .catch((error) => {
      console.error('Error pushing metrics:', error);
    });
}

sendMetricsPeriodically(5000);

module.exports = {
  requestTracker, 
  trackPurchase,
  simulateAuthentication,
  trackPizzaCreationFailure,
  addActiveUsers,
  minusActiveUsers,
  setPizzaRespondTime,
  get activeUsers() {
    return activeUsers;
  }
};
