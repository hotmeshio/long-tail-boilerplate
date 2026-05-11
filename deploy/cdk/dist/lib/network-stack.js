"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
class NetworkStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        this.vpc = new ec2.Vpc(this, 'Vpc', {
            maxAzs: 2,
            natGateways: 1,
            subnetConfiguration: [
                {
                    name: 'Public',
                    subnetType: ec2.SubnetType.PUBLIC,
                    cidrMask: 24,
                },
                {
                    name: 'Private',
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                    cidrMask: 24,
                },
                {
                    name: 'Isolated',
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                    cidrMask: 24,
                },
            ],
        });
        // Security groups live here to avoid cross-stack cyclic dependencies.
        // Both DataStack (RDS) and ComputeStack (Fargate, ALB) reference these.
        this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
            vpc: this.vpc,
            description: 'Security group for Long Tail ALB',
        });
        this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP from anywhere');
        this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS from anywhere');
        this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(9222), 'NATS WebSocket from anywhere (TLS terminated at ALB)');
        this.appSecurityGroup = new ec2.SecurityGroup(this, 'AppSecurityGroup', {
            vpc: this.vpc,
            description: 'Security group for Long Tail API Fargate tasks',
        });
        this.appSecurityGroup.connections.allowFrom(this.albSecurityGroup, ec2.Port.tcp(3030), 'ALB to API container');
        this.workerSecurityGroup = new ec2.SecurityGroup(this, 'WorkerSecurityGroup', {
            vpc: this.vpc,
            description: 'Security group for Long Tail worker Fargate tasks - no inbound',
        });
        this.natsSecurityGroup = new ec2.SecurityGroup(this, 'NatsSecurityGroup', {
            vpc: this.vpc,
            description: 'Security group for NATS event bus',
        });
        // API and worker tasks connect to NATS for cross-server event delivery
        this.natsSecurityGroup.connections.allowFrom(this.appSecurityGroup, ec2.Port.tcp(4222), 'API tasks to NATS');
        this.natsSecurityGroup.connections.allowFrom(this.workerSecurityGroup, ec2.Port.tcp(4222), 'Worker tasks to NATS');
        // ALB forwards browser WebSocket connections to NATS (port 9222)
        // and checks health on the monitoring port (8222)
        this.natsSecurityGroup.connections.allowFrom(this.albSecurityGroup, ec2.Port.tcp(9222), 'ALB to NATS WebSocket');
        this.natsSecurityGroup.connections.allowFrom(this.albSecurityGroup, ec2.Port.tcp(8222), 'ALB health check to NATS monitoring');
        this.dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
            vpc: this.vpc,
            description: 'Security group for Long Tail RDS instance',
        });
        // Both API and worker tasks connect directly to RDS
        // (no proxy — LISTEN/NOTIFY needs persistent connections)
        this.dbSecurityGroup.connections.allowFrom(this.appSecurityGroup, ec2.Port.tcp(5432), 'API tasks to RDS');
        this.dbSecurityGroup.connections.allowFrom(this.workerSecurityGroup, ec2.Port.tcp(5432), 'Worker tasks to RDS');
    }
}
exports.NetworkStack = NetworkStack;
