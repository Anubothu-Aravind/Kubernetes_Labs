# Kubernetes and Container Orchestration Labs

**Course:** 26CS52B1E · Kubernetes and Container Orchestration  
**Program:** M.Tech CSE · Semester 2  

---

## Lab Index

### [Lab 1: Multi-Node Kubernetes Cluster Setup and Workload Management](./Lab_1/README.md)
- **InLab:**
  - Question 1: Create a 3-node Kubernetes cluster with kind and identify control-plane components.
  - Question 2: Deploy nginx with three replicas, observe self-healing, scale the Deployment, and open the application in a browser.
- **PostLab:**
  - Question 1: Deploy httpd with 4 replicas on a 4-node cluster (`kind-4node.yaml`).
  - Question 2: Simulate worker node failure, observe pod status, and verify node recovery.
  - Question 3: Comparative analysis between standalone Docker container and Kubernetes Deployment.
  - Question 4: Cluster clean up.

### [Lab 2: Trace `kubectl create deployment` End to End](./Lab_2/README.md)
- **InLab:**
  - Question 1: Follow one Deployment from the kubectl command to running containers and collect evidence of acting components (API Server, etcd, Controllers, Scheduler, Kubelet, CRI, Kube-proxy, and Optimistic Concurrency Control 409 Conflict).
- **PostLab:**
  - Question 1: Concurrency conflict manifest verification (`web-old.yaml`).

### [Lab 3: Write Your First Controller](./Lab_3/README.md)
- **InLab:**
  - Question 1: Implement and verify a custom Kubernetes controller in Go using `client-go` to manage ConfigMaps across labelled namespaces (informers, work queues, reconciliation loop, self-healing, level-triggered catch-up, concurrency idempotency, and label removal semantics).
- **PostLab:**
  - Question 1: Create custom ConfigMap with student ID and section metadata (`student-2601050069`).
  - Question 2: Implement department-based namespace filtering (`klu.edu/dept=cse`).
  - Question 3: Implement automated cleanup and garbage collection upon label removal.

### [Lab 4: Read the Scheduler and Find Why Pods Stay Pending](./Lab_4/README.md)
- **InLab:**
  - Question 1: Sparse-clone `kube-scheduler` (`v1.37.0`), list default filter and score plugins with weights, and trace `schedule_one.go`.
  - Question 2: Induce `Pending` Pods across five experiments (`NodeResourcesFit`, `NodeAffinity`, `TaintToleration`, `NodePorts`, `NodeUnschedulable`) and match `FailedScheduling` events to their plugins.
- **PostLab:**
  - Status: Pending / To be assigned.
